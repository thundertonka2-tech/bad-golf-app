#!/usr/bin/env python3
# v2026.11.2083 -- 11's is scored against PAR again (Tyler, 11/26: "It should be scored based on the par for that
# hole. Then the total score is net to par or gross... If not you would avoid all par 5's"). Each kept hole counts
# its net (or gross) score against that hole's par; the total is to par over the kept holes. Net / gross, the
# splits, the field pool, the tab order and the choices themselves are unchanged.
import sys, io
OLD_V, NEW_V = 'v2026.11.2082', 'v2026.11.2083'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new, cnt=1):
        nonlocal src
        c = src.count(old); assert c == cnt, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('to par', "    return net;   // v2079 (Tyler): raw strokes, not to par", "    return net - par;   // v2083 (Tyler): against the hole's par -- raw strokes made everyone throw out the par 5s")
    one('fmt', "function bgElevensToPar(v) { return String(Math.round((Number(v) || 0) * 100) / 100); }   // v2079: a stroke total (the name is historical)",
        "function bgElevensToPar(v) { v = Math.round((Number(v) || 0) * 100) / 100; return v === 0 ? 'E' : (v > 0 ? '+' + v : '−' + (-v)); }   // v2083: to par -- E, +2, −3")
    one('header', "has a score. Lowest total STROKES over the kept holes wins (v2079; net or gross).", "has a score. Lowest total TO PAR over the kept holes wins (v2083; each hole net or gross against its own par).")
    one('bubble val', "    if (c.kept) out.val = String(c.total);", "    if (c.kept) out.val = bgElevensToPar(c.total);")
    one('bubble title', "(c.kept ? c.total + ' strokes, ' : '') + c.kept + ' of ' + c.need + ' holes kept'", "(c.kept ? bgElevensToPar(c.total) + ' to par, ' : '') + c.kept + ' of ' + c.need + ' holes kept'")
    one('bubble html title', "title=\"11's — your strokes over the holes you kept\"", "title=\"11's — your score to par over the holes you kept\"")
    one('tab keep cell', "html[i] = '<span class=\"sc-mu sc-mu-as sc-q-pt\">' + r.v + '</span>'; }", "html[i] = '<span class=\"sc-mu sc-mu-' + (r.v < 0 ? 'up' : 'as') + ' sc-q-pt\">' + bgElevensToPar(r.v) + '</span>'; }")
    one('tab out cell', "else if (r.st === 'out') html[i] = '<span class=\"sc-mu sc-mu-none sc-el-x\"><s>' + r.v + '</s></span>';", "else if (r.st === 'out') html[i] = '<span class=\"sc-mu sc-mu-none sc-el-x\"><s>' + bgElevensToPar(r.v) + '</s></span>';")
    one('tab pend cell', "else html[i] = '<span class=\"sc-mu sc-mu-none sc-el-q\">' + r.v + '?</span>';", "else html[i] = '<span class=\"sc-mu sc-mu-none sc-el-q\">' + bgElevensToPar(r.v) + '?</span>';")
    one('tab foot', "'<b class=\"sc-q-pts\">' + r.pts + '</b> ' + escapeHtml(T('strokes')) + ' · ' + r.kept + '/' + r.need + ' ' + escapeHtml(T('kept'));",
        "'<b class=\"sc-q-pts\">' + bgElevensToPar(r.pts) + '</b> ' + escapeHtml(T('to par')) + ' · ' + r.kept + '/' + r.need + ' ' + escapeHtml(T('kept'));")
    one('tab cap', "(net ? 'net' : 'gross') + ' strokes' + (G.team ? ', team low ball' : '') + '. Kept holes count; crossed-out holes were thrown out; low total wins.'",
        "(net ? 'net' : 'gross') + ' to par' + (G.team ? ', team low ball' : '') + '. Each hole is scored against its par. Kept holes count; crossed-out holes were thrown out; low total wins.'")
    one('tab totals', "  if (c.key === 'out') return r.outAny ? '<span class=\"sc-mu sc-mu-as\">' + _bgPtFmt(r.outN) + '</span>' : _bgPtCellHtml(null);\n  if (c.key === 'in') return r.inAny ? '<span class=\"sc-mu sc-mu-as\">' + _bgPtFmt(r.innN) + '</span>' : _bgPtCellHtml(null);\n  return '<span class=\"sc-mu sc-mu-tot sc-mu-' + (r.rank === 1 ? 'up' : 'as') + ' sc-q-tot\">' + _bgPtFmt(r.pts) + '</span>';",
        "  const _F = (pm && pm.low && typeof bgElevensToPar === 'function') ? bgElevensToPar : _bgPtFmt;   // v2083: 11's totals read to par (E, +2, −3)\n  if (c.key === 'out') return r.outAny ? '<span class=\"sc-mu sc-mu-as\">' + _F(r.outN) + '</span>' : _bgPtCellHtml(null);\n  if (c.key === 'in') return r.inAny ? '<span class=\"sc-mu sc-mu-as\">' + _F(r.innN) + '</span>' : _bgPtCellHtml(null);\n  return '<span class=\"sc-mu sc-mu-tot sc-mu-' + (r.rank === 1 ? 'up' : 'as') + ' sc-q-tot\">' + _F(r.pts) + '</span>';")
    one('summary ind', "st.map(x => x.name + ' ' + x.total).join(' · ');", "st.map(x => x.name + ' ' + bgElevensToPar(x.total)).join(' · ');")
    one('summary team', "      return r.teamA + ' ' + r.aTotal + ' v ' + r.teamB + ' ' + r.bTotal + (r.winner === 'Tie'", "      return r.teamA + ' ' + bgElevensToPar(r.aTotal) + ' v ' + r.teamB + ' ' + bgElevensToPar(r.bTotal) + (r.winner === 'Tie'")
    one('award rows', "st.slice(0, 6).map(s => s.name + ' ' + (s.done ? s.total : s.kept + '/' + s.need + ' kept')).join(' · ');", "st.slice(0, 6).map(s => s.name + ' ' + (s.done ? bgElevensToPar(s.total) : s.kept + '/' + s.need + ' kept')).join(' · ');")
    one('help ind (setup + help sheet)', "Lowest total strokes over the kept holes wins, net or gross.", "Each hole is scored against its par, net or gross, and the lowest total to par over the kept holes wins.", 2)
    one('help team (setup + help sheet)', "Lowest total strokes wins and each player on the other team gives the units.", "Each hole is scored against its par and the lowest total to par wins; each player on the other team gives the units.", 2)
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
