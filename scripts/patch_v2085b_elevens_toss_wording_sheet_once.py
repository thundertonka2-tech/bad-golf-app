#!/usr/bin/env python3
# v2026.11.2085 (second part, same build) -- Tyler, 11/27, on the 11's sheet and card:
#  - "throw out" reads "Toss" everywhere in 11's
#  - "made 4" reads "made par" / bogey / double / triple, then "+4" (birdie / eagle under par)
#  - nothing prompts until every score for the hole is in; then the sheet pops up ONCE
#  - the extra "Keep or throw out - hole N" button under the card is gone (the Keep / Toss buttons are already there)
import sys, io, re
V = 'v2026.11.2085'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    assert src.count(V) == 4, (path, 'run the v2085 patch first', src.count(V))
    if 'function bgElevensScoreName(' in src: print(path, 'already patched'); return
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    # --- score names ---
    one('score name fn', "var _bgElSheet = { timer: null, hole: 0, picks: {} };",
        "var _bgElSheet = { timer: null, hole: 0, picks: {}, shown: {} };\n// \"made par\", bogey, double, triple, then +4 ... (birdie / eagle under par)\nfunction bgElevensScoreName(d) { d = Math.round(Number(d) || 0); return d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'double' : d === 3 ? 'triple' : d > 3 ? ('+' + d) : d === -1 ? 'birdie' : d === -2 ? 'eagle' : ('\\u2212' + (-d)); }")
    one('detail', "          detail = 'made ' + gross + ((G.cfg.net !== false && net !== Number(gross)) ? ' (net ' + net + ')' : '');",
        "          detail = 'made ' + bgElevensScoreName(Number(gross) - par) + ((G.cfg.net !== false && net !== Number(gross)) ? ' (net ' + bgElevensScoreName(net - par) + ')' : '');")
    # --- the sheet pops up once per hole ---
    one('once', "    if (!bgElevensSheetDue(g, h)) return;\n    _bgElSheet.timer = setTimeout(function () {\n      _bgElSheet.timer = null;\n      try { const cur = state.game; if (cur && cur.code === g.code && !state.viewOnlyMode && bgElevensSheetDue(cur, h)) bgElevensSheetOpen(h); } catch (e) {}",
        "    if (!bgElevensSheetDue(g, h)) return;\n    const _once = String(g.code || '') + ':' + h;\n    if (_bgElSheet.shown[_once]) return;                       // it pops up once; after \"Not now\" the card's own buttons take over\n    _bgElSheet.timer = setTimeout(function () {\n      _bgElSheet.timer = null;\n      try { const cur = state.game; if (cur && cur.code === g.code && !state.viewOnlyMode && bgElevensSheetDue(cur, h)) { _bgElSheet.shown[_once] = 1; bgElevensSheetOpen(h); } } catch (e) {}")
    # --- the card: no prompt until every score is in; no extra button ---
    c0 = src.count("    let pend = false, rows = '';")
    assert c0 == 1, (path, 'banner head', c0)
    one('hole in', "    let pend = false, rows = '';", "    let pend = false, rows = '';\n    const holeIn = (typeof isHoleComplete !== 'function') || isHoleComplete(g, h);   // v2085: nothing is asked until every score is in")
    one('pend only when in', "      if (r.st === 'pending') pend = true;\n      const left = Math.max(0, c.maxOut - c.out);", "      if (r.st === 'pending' && holeIn) pend = true;\n      const left = Math.max(0, c.maxOut - c.out);")
    one('wait text', "      if (r.st === 'none') ctl = '<span class=\"small-text\">Score first</span>';", "      if (r.st === 'none') ctl = '<span class=\"small-text\">Score first</span>';\n      else if (r.st === 'pending' && !holeIn) ctl = '<span class=\"small-text\">' + bgElevensToPar(r.v) + ' \\u00b7 keep or toss once every score is in</span>';")
    a = src.index("    if (pend) { const ob = document.createElement('button'); ob.type = 'button'; ob.className = 'bg-btn bg-btn--primary bg-el-open';"); b = src.index("\n", a)
    assert src[a:b].rstrip().endswith('// v2084'), 'open button line'
    src = src[:a] + src[b + 1:]; n[0] += 1
    # --- wording: Toss ---
    def region(start, end):
        a = src.index(start); b = src.index(end, a); assert src.count(start) == 1, (start[:40], src.count(start)); return a, b
    def reword(start, end):
        nonlocal src
        a, b = region(start, end); seg = src[a:b]
        seg = re.sub(r"' throw-out' \+ \(([^?]+)\? '' : 's'\)", lambda m: "' toss' + (" + m.group(1) + "? '' : 'es')", seg)
        for x, y in (('Thrown out', 'Tossed'), ('thrown out', 'tossed'), ('Throw out', 'Toss'), ('throw out', 'toss'), ('Throw-outs', 'Tosses'), ('throw-outs', 'tosses'), ('throw-out', 'toss')):
            seg = seg.replace(x, y)
        src = src[:a] + seg + src[b:]; n[0] += 1
    reword("/* ===================== v2078: 11's and Team 11's", "function calcLowNetPool(g) {")
    reword("          <!-- v2078: 11's - best 11 net holes", '            <input type="checkbox" id="game-lownet">')
    reword("  elevens: {\n    title: \"11's\",", "  lownet: {\n    title: 'Low Net Pool',")
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
