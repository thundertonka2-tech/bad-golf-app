#!/usr/bin/env python3
# v2026.11.2093 -- Tyler, 11/28 4:26am, iPhone screen recording, New tournament > Step 2 "What's it called?":
# "It highlights the text then I get stuck here." Tapping into the name selects all of it; every tap on Next
# (the button visibly presses) only drops the highlight, the highlight comes straight back, and the step never
# moves until the keyboard is put away.
# Two pieces were feeding each other:
#  * the app-wide "select everything when a box gets focus" rule (written for short number boxes such as a
#    handicap) also fired on this name, and fired AGAIN each time the box got focus back after a tap;
#  * with a selection on screen iOS spends the tap on clearing the selection, and the button's click never arrives.
# What changed:
#  * Select-all-on-focus is for number boxes and short text (8 characters or fewer) only, and never twice on the
#    same box inside 1.5 s -- a longer name gets a caret where you tapped, like any text field.
#  * The wizard's name box opts out outright.
#  * The wizard's Next / Create button also listens for the finger lifting: if the press ended on the button and no
#    click arrived, it advances anyway (once).
import sys, io
OLD_V, NEW_V = 'v2026.11.2092', 'v2026.11.2093'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('select-all rule', "    if (t.dataset.noSelectAll === 'true') return;\n",
        "    if (t.dataset.noSelectAll === 'true') return;\n"
        "    /* v2093 (Tyler, iPhone recording 11/28: \"it highlights the text then I get stuck\"). This rule is for short boxes you\n"
        "       retype (a handicap, a stake). On a longer text value it is in the way, and on iOS a selection makes the next tap\n"
        "       on a button only clear the selection -- then the box got focus back and this selected it all again, for ever.\n"
        "       So: number boxes and short text only, and never twice on the same box in quick succession. */\n"
        "    if (type === 'text' && String(t.value == null ? '' : t.value).length > 8) return;\n"
        "    try { const _now = Date.now(); if (window._bgSelAllEl === t && (_now - (window._bgSelAllAt || 0)) < 1500) return; window._bgSelAllEl = t; window._bgSelAllAt = _now; } catch (e) {}\n")
    one('name opt out', "<input id=\"t2qs-name\" type=\"text\" maxlength=\"80\" autocomplete=\"off\" data-no-draft value=\"",
        "<input id=\"t2qs-name\" type=\"text\" maxlength=\"80\" autocomplete=\"off\" data-no-draft data-no-select-all=\"true\" value=\"")
    one('next lift', "    setTimeout(() => { try { renderT2List(); } catch (e) {} }, 2500);\n  };\n}\nfunction _bgQsKeep() {",
        "    setTimeout(() => { try { renderT2List(); } catch (e) {} }, 2500);\n  };\n"
        "  /* v2093: with the keyboard up, iOS can show the button pressed and still never send its click. If a press that\n"
        "     started on the button also ended on it and no click followed, run the button once. */\n"
        "  try {\n"
        "    const _nx = q('#t2qs-next'); let _dn = 0, _ck = 0;\n"
        "    _nx.addEventListener('pointerdown', () => { _dn = Date.now(); });\n"
        "    _nx.addEventListener('click', () => { _ck = Date.now(); }, true);\n"
        "    _nx.addEventListener('pointerup', (e) => {\n"
        "      const d = _dn; if (!d) return;\n"
        "      try { const r = _nx.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return; } catch (e2) {}\n"
        "      setTimeout(() => { try { if (_ck < d && _nx.isConnected && !_nx.disabled) { _ck = Date.now(); _nx.onclick && _nx.onclick(); } } catch (e2) {} }, 300);\n"
        "    });\n"
        "  } catch (e) {}\n"
        "}\nfunction _bgQsKeep() {")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', n[0], 'edits')
for f in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(f)
