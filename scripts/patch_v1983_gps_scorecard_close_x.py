import sys
OLD_VER, NEW_VER = 'v2026.11.1982', 'v2026.11.1983'
edits = [
("""        <button class="bg-btn bg-btn--glass bg-btn--icon" id="gps-sc-zoom-in" aria-label="Zoom in" style="width:34px;height:34px;line-height:1">+</button>
      </div>
    </div>""",
 """        <button class="bg-btn bg-btn--glass bg-btn--icon" id="gps-sc-zoom-in" aria-label="Zoom in" style="width:34px;height:34px;line-height:1">+</button>
      </div>
      <!-- v1983 (Tyler, spectating 11/1: "No way to go back and no way to close it"): a ✕ in the
           upper right, in the sticky header, so the way out is on screen however far the card is
           scrolled or zoomed. Same action as Back to map. -->
      <button class="bg-btn bg-btn--glass bg-btn--icon" id="gps-scorecard-close-top" aria-label="Close scorecard" style="position:absolute;right:0;top:0;width:34px;height:34px;line-height:1;flex:0 0 auto">✕</button>
    </div>""",
 "x button"),
("""  #gps-scorecard-panel > div:first-child { position: sticky; top: -12px; z-index: 2; background: var(--bgx-frost-98); padding-top: 12px; margin-top: -12px !important; }""",
 """  #gps-scorecard-panel > div:first-child { position: sticky; top: -12px; z-index: 2; background: var(--bgx-frost-98); padding-top: 12px; margin-top: -12px !important; }
  #gps-scorecard-panel > div:first-child > div:first-child { padding: 0 40px; }   /* v1983: room for the ✕ on the right (and symmetry) */
  #gps-scorecard-close-top { top: 12px !important; }   /* v1983: below the header's own 12px top padding */""",
 "x css"),
# pinch-zoom while the sheet is open -> reset, so the sheet's bottom (Back to map) can't leave the screen
("""      const _scct = el('gps-scorecard-close-top'); if (_scct) _scct.onclick = _sccClose; }   // v1731: header copy of the same way out""",
 """      const _scct = el('gps-scorecard-close-top'); if (_scct) _scct.onclick = _sccClose; }   // v1731: header copy of the same way out · v1983: the ✕ top-right
    // v1983: a pinch on the page (the header strip is not touch-action locked like the card is) zooms the
    // whole fixed overlay and pushes the sheet's bottom edge - Back to map - off the visible screen. While
    // the sheet is open, any page zoom is undone, so the sheet always fits the screen.
    try {
      if (window.visualViewport && !window._bgScPinchWired) {
        window._bgScPinchWired = true;
        let _t = null;
        window.visualViewport.addEventListener('resize', () => {
          try {
            const _p = el('gps-scorecard-panel'); if (!_p || !_p.style.display || _p.style.display === 'none') return;
            if (!(window.visualViewport.scale > 1.01)) return;
            clearTimeout(_t); _t = setTimeout(() => { try { bgResetPageZoom(); } catch (e) {} }, 150);
          } catch (e) {}
        });
      }
    } catch (e) {}""",
 "pinch reset"),
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
