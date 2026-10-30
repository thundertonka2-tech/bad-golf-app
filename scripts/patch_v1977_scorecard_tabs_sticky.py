import sys
OLD_VER, NEW_VER = 'v2026.11.1976', 'v2026.11.1977'
edits = [
("""  caption.sc-tabs .sc-tabs-row { display: flex; gap: 6px; flex-wrap: nowrap; }""",
 """  /* v1977 (Tyler, 10/29): "I want to see the units won on each hole ... I don't see in the app
     here." The chips ARE on the card, but a caption scrolls with its table: on a phone the
     scorecard is a horizontal scroller, so once you swipe to the back nine the Match / Strokes /
     Units row has gone off the left edge with holes 1-9 (the blank band above the grid). The
     name column is already pinned; pin the chips the same way so they stay put at any scroll. */
  caption.sc-tabs .sc-tabs-row { display: flex; gap: 6px; flex-wrap: nowrap; position: sticky; left: 0; width: max-content; max-width: 100%; z-index: 4; }""",
 "sticky scorecard tabs"),
("<!--BGVER=" + OLD_VER + "-->", "<!--BGVER=" + NEW_VER + "-->", "BGVER"),
("const BG_BUILD = '" + OLD_VER + "';", "const BG_BUILD = '" + NEW_VER + "';", "BG_BUILD"),
]
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old); assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched')
