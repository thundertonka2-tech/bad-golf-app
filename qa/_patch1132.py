#!/usr/bin/env python3
"""v1132 — remove Live Holes Across America.

Removes, in both files:
  1. the LIVE_COURSES dataset (50 courses)
  2. the lh* module block  -- EXCEPT bgOpenDoc, which is lifted out (see below)
  3. the renderLiveCamsHome() call in the Home render
  4. the #home-livecams-card markup

bgOpenDoc lives INSIDE the block commented "self-contained module" and is nothing to
do with Live Holes: it is the onclick for four <a> links -- Player Guide, Admin
Guide, Privacy Policy, Terms of Service. In the Capacitor webview a target="_blank"
href does nothing, so without it those four links are dead on iOS, and two of them
are App Store requirements. It is preserved verbatim.
"""
import sys, io, re

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

MOD_START = '/* ===== Live Holes Across America (v2026.11.267) — self-contained module ===== */'
MOD_END   = '/* ===== end Live Holes Across America ===== */'
DOC_START = '// Open a documentation PDF so the buttons work on iOS (Capacitor) too. A relative'
DOC_END   = "  try{ location.href=url; }catch(e){}\n  return false;\n}"

CALL_OLD = """  // ---- Live Holes Across America (collapsible) ----
  try { renderLiveCamsHome(); } catch (e) { console.warn('live cams home failed:', e); }
"""

CARD_OLD = """      <!-- Live Holes Across America — collapsible (collapsed by default) -->
      <div class="card" id="home-livecams-card">
        <div id="lh-home-header" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">
          <h2 style="margin:0">Live Holes Across America</h2>
          <span id="lh-home-chev" style="font-size:18px">▸</span>
        </div>
        <p class="help-text" id="lh-home-sub" style="margin:6px 0 0">Peek at live course cams nationwide. <span id="lh-home-count"></span></p>
        <div id="lh-home-body" style="display:none;margin-top:10px"></div>
      </div>

"""


LANDMARK_OLD = """      <!-- Course Preview \u2014 search any course, preview its GPS holes + scorecard,
           then jump straight into a new round with it chosen. Placed just above
           Live Holes Across America (moved down from just below Your rounds, Jul 2026). -->"""

LANDMARK_NEW = """      <!-- Course Preview \u2014 search any course, preview its GPS holes + scorecard,
           then jump straight into a new round with it chosen. Sat above Live Holes
           Across America until that card was removed in v1132; now the last card
           before Account. -->"""

VIDEO_OLD = "// player (same approach as Live Holes). It's a vertical Short, so the frame is"
VIDEO_NEW = "// player (the nocookie embed pattern Live Holes used before v1132 removed it).\n// It's a vertical Short, so the frame is"

KEPT_HEADER = """// v1132: Live Holes Across America was removed (Tyler, 8/19). bgOpenDoc below was
// the ONE thing in that "self-contained module" that had nothing to do with it — it
// is the onclick for the Player Guide, Admin Guide, Privacy Policy and Terms of
// Service links. Inside the Capacitor webview a target="_blank" href does nothing,
// so deleting the block with it would have left all four dead on iOS, two of them
// App Store requirements, and the <a href> would still have worked on web — so it
// would have looked fine everywhere it was likely to be tested.
"""

# things that must not survive anywhere in the file
FORBIDDEN = ['LIVE_COURSES', 'renderLiveCamsHome', 'lhOpenDetail', 'lhRenderList',
             'lhHomeOpen', 'home-livecams-card', 'lh-home-body', 'bg_live_holes_open']

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()

    # ---- 1. slice the module block, rescuing bgOpenDoc -----------------------
    assert s.count(MOD_START) == 1, '%s: module start x%d' % (path, s.count(MOD_START))
    assert s.count(MOD_END) == 1,   '%s: module end x%d'   % (path, s.count(MOD_END))
    i = s.index(MOD_START)
    j = s.index(MOD_END) + len(MOD_END)
    block = s[i:j]

    assert block.count(DOC_START) == 1, '%s: bgOpenDoc comment not found in block' % path
    assert block.count(DOC_END) == 1,   '%s: bgOpenDoc tail not found in block' % path
    d0 = block.index(DOC_START)
    d1 = block.index(DOC_END) + len(DOC_END)
    doc = block[d0:d1]
    assert 'function bgOpenDoc(name){' in doc, '%s: rescued chunk is not bgOpenDoc' % path

    s = s[:i] + KEPT_HEADER + doc + s[j:]

    # ---- 2. the LIVE_COURSES dataset ----------------------------------------
    assert s.count('var LIVE_COURSES = [') == 1, '%s: LIVE_COURSES decl x%d' % (path, s.count('var LIVE_COURSES = ['))
    a = s.index('var LIVE_COURSES = [')
    b = s.index('\n];\n', a) + len('\n];\n')
    removed = s[a:b]
    assert removed.count("{id:'") > 40, '%s: LIVE_COURSES slice looks wrong (%d entries)' % (path, removed.count("{id:'"))
    s = s[:a] + s[b:]

    # ---- 3. the Home render call --------------------------------------------
    assert s.count(CALL_OLD) == 1, '%s: render call x%d' % (path, s.count(CALL_OLD))
    s = s.replace(CALL_OLD, '')

    # ---- 4. the card markup --------------------------------------------------
    assert s.count(CARD_OLD) == 1, '%s: card markup x%d' % (path, s.count(CARD_OLD))
    s = s.replace(CARD_OLD, '')

    # ---- 4b. stale comments that pointed at the deleted card -----------------
    assert s.count(LANDMARK_OLD) == 1, '%s: landmark comment x%d' % (path, s.count(LANDMARK_OLD))
    s = s.replace(LANDMARK_OLD, LANDMARK_NEW)
    assert s.count(VIDEO_OLD) == 1, '%s: video comment x%d' % (path, s.count(VIDEO_OLD))
    s = s.replace(VIDEO_OLD, VIDEO_NEW)

    # ---- 5. version ----------------------------------------------------------
    assert s.count("BG_BUILD = 'v2026.11.1131'") == 1
    s = s.replace("BG_BUILD = 'v2026.11.1131'", "BG_BUILD = 'v2026.11.1132'")

    # ---- 6. nothing left behind ---------------------------------------------
    for tok in FORBIDDEN:
        n = s.count(tok)
        assert n == 0, '%s: %r still appears %d time(s) after removal' % (path, tok, n)
    assert s.count('function bgOpenDoc(name){') == 1, '%s: bgOpenDoc lost!' % path
    assert s.count("bgOpenDoc('Bad_Golf_Privacy_Policy.pdf')") == 1, '%s: privacy link lost!' % path

    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print('patched %s  (removed %d chars of course data + module)' % (path, len(removed)))
