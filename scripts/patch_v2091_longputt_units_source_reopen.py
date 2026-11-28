#!/usr/bin/env python3
# v2026.11.2091 -- Tyler, 11/27 7:09pm (TEST Saturday event, his own group):
#  1. "When I went into the test tournament and click on the person name for long putt, nothing happens now."
#  2. "the second screen says units but does not makes any sense or tell you what the bet/game was."
#  3. "Check all the buttons again and make sure we didn't mess anything else up like we did with the long putt."
# What changed:
#  * Long putt name chip: never a silent no-op. A chip drawn for an older copy of the round now marks the pick on the
#    round that is on screen (it used to replay the tap on a redrawn chip and quietly give up when there was none);
#    a tap while the distance box has the keyboard still redraws; any error says so instead of doing nothing.
#  * A pick this phone just made is kept when the server's copy arrives without it (same guard CTP and greenies have).
#  * "Reopen round & edit" on the results sheet works right after Finish (it closed the sheet and left the round finished).
#  * Units tab: one line per game under the grid naming the game and what each player made / lost on it.
import sys, io, re
OLD_V, NEW_V = 'v2026.11.2090', 'v2026.11.2091'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    # ---- 1. long putt chip ----
    a = src.index("      const pid = chip.dataset.lpPid;\n")
    assert src.count("      const pid = chip.dataset.lpPid;\n") == 1
    endm = "      await saveGame(g);\n      renderLongPuttEntry();\n    };\n  });\n  const ftInp = ctr.querySelector('#lp-ft'), inInp = ctr.querySelector('#lp-in');"
    assert src.count(endm) == 1
    b = src.index(endm)
    assert 0 < b - a < 1600, (path, 'lp span', b - a)
    new_body = (
        "      const pid = chip.dataset.lpPid;\n"
        "      /* v2091 (Tyler, 11/27: \"click on the person name for long putt, nothing happens\"). This used to replay the tap on a\n"
        "         redrawn chip when the round object had been swapped by a sync, and returned without a word when the redraw\n"
        "         did not produce a new chip. The pick now goes on the round that is on screen, and a failure says so. */\n"
        "      try {\n"
        "        let gg = g;\n"
        "        if (state.game && state.game !== g) {\n"
        "          if (state.game.code !== g.code) { try { renderLongPuttEntry(); } catch (e) {} return; }\n"
        "          gg = state.game;\n"
        "        }\n"
        "        if (!gg.longPuttData || typeof gg.longPuttData !== 'object') gg.longPuttData = { pid: null, ft: null, in: null };\n"
        "        const d = gg.longPuttData;\n"
        "        d.pid = (d.pid === pid) ? null : pid;\n"
        "        try { delete d.co; } catch (e) {}   // v2002 (matrix POOLS-7): a new pick replaces any tie\n"
        "        if (!d.pid) { d.ft = null; d.in = null; }\n"
        "        d.at = Date.now();   // v1161\n"
        "        try { const _ae = document.activeElement; if (_ae && (_ae.id === 'lp-ft' || _ae.id === 'lp-in')) _ae.blur(); } catch (e) {}   // the redraw skips while a distance box has focus\n"
        "        try { renderLongPuttEntry(); } catch (e) {}   // v1735: paint first, then save (the tap no longer waits on the cloud)\n"
        "        await saveGame(gg);\n"
        "        try { renderLongPuttEntry(); } catch (e) {}\n"
        "      } catch (e) {\n"
        "        try { console.warn('long putt pick', e); } catch (e2) {}\n"
        "        try { showToast('Couldn\\u2019t mark the long putt \\u2014 tap the name again', 'warn'); } catch (e2) {}\n"
        "      }\n"
        "    };\n  });\n  const ftInp = ctr.querySelector('#lp-ft'), inInp = ctr.querySelector('#lp-in');")
    src = src[:a] + new_body + src[b + len(endm):]; n[0] += 1
    # ---- 2. receive side keeps my newer pick ----
    one('rx keep lp', "    if (_wiped) { try { markGameDirty(prev.code); } catch (e) {} }",
        "    // v2091: the long putt pick gets the same protection -- my newer stamped pick stays on top of a server row that lacks it.\n"
        "    try {\n"
        "      const _la = prev.longPuttData, _lb = incoming.longPuttData;\n"
        "      if (_la && _la.at > 0 && !(((_lb && _lb.at > 0) ? _lb.at : 0) >= _la.at)) { incoming.longPuttData = _la; _wiped = true; }\n"
        "    } catch (e) {}\n"
        "    if (_wiped) { try { markGameDirty(prev.code); } catch (e) {} }")
    # ---- 3. reopen from the results sheet ----
    one('reopen guard', "    if (!g || !state.viewOnlyMode) return;",
        "    if (!g || (!state.viewOnlyMode && !g.finishedAt)) return;   // v2091: the results sheet's Reopen runs on the scorer's own phone, which is not read-only yet")
    # ---- 4. units: name the games ----
    one('model games', "    const model = { rows, end, pts, played: played, nH: nH, label: 'Units',",
        "    // v2091: every game with units in it, by name, with each player's figure -- the line under the Units grid.\n"
        "    const games = [];\n"
        "    keys.forEach(k => {\n"
        "      const fin = last.g[k]; if (!fin) return;\n"
        "      if (!Object.keys(fin.money || {}).some(id => Math.abs(fin.money[id] || 0) >= 0.005)) return;\n"
        "      games.push({ key: k, label: fin.label || k, money: fin.money || {}, end: end.some(e => e.key === k) });\n"
        "    });\n"
        "    const model = { rows, end, pts, games, played: played, nH: nH, label: 'Units',")
    one('band gate', "    if (!_pts.length) return;   // v2022",
        "    const _gm = (_foot && Array.isArray(model.games)) ? model.games : [];   // v2091\n"
        "    if (!_pts.length && !_gm.length) return;   // v2022")
    one('band foot', "    } else if (model.pts && model.pts.length) {\n      h += '';\n    }\n",
        "    }\n"
        "    /* v2091 (Tyler, 11/27: the Units tab \"does not ... tell you what the bet/game was\"). One short line per game:\n"
        "       its name and what each player made or lost on it. A game paid at the end (a pool like 11's) says so, which\n"
        "       is why its holes read 0 and only Tot moves. */\n"
        "    if (_gm.length) {\n"
        "      const _T = s => (typeof bgT === 'function') ? bgT(s) : s;\n"
        "      const bits = _gm.map(e => {\n"
        "        const who = (g.players || []).filter(p => p && p.id && Math.abs((e.money || {})[p.id] || 0) >= 0.005)\n"
        "          .sort((a, b) => (e.money[b.id] || 0) - (e.money[a.id] || 0))\n"
        "          .map(p => escapeHtml(first(p.id)) + ' ' + _bgUnitsFmt(e.money[p.id])).join(' \\u00b7 ');\n"
        "        return '<div class=\"sc-ub-line\"><b>' + escapeHtml(e.label) + '</b>' + (e.end ? ' <span class=\"sc-ub-note\">(' + escapeHtml(_T('paid at the end, not hole by hole')) + ')</span>' : '') + ' \\u2014 ' + who + '</div>';\n"
        "      }).join('');\n"
        "      h += '<tr class=\"sc-ub-foot\"><td colspan=\"' + nCols + '\"><div class=\"sc-ub-title\">' + escapeHtml(_T('What these units are from')) + '</div>' + bits + '</td></tr>';\n"
        "    }\n")
    one('css note', "  tbody.sc-units-band .sc-ub-line { font-size: 12px; }",
        "  tbody.sc-units-band .sc-ub-line { font-size: 12px; }\n  tbody.sc-units-band .sc-ub-note { font-weight: 400; color: var(--text-muted); }\n  .bg-ss-bands .bg-ss-band-title { font-weight: 800; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--bg-text-muted, var(--text-muted)); }")
    # ---- 5. the new card reads the foot line by line ----
    one('stand bands', "if (D.mode === 'units') Array.from(tb.rows).forEach(tr => { const x = (tr.textContent || '').replace(/\\s+/g, ' ').trim(); if (x) D.bands.push(x); }); return; }",
        "if (D.mode === 'units') Array.from(tb.rows).forEach(tr => { if (tr.classList.contains('sc-ub-foot')) { tr.querySelectorAll('.sc-ub-title, .sc-ub-line').forEach(d => { const y = (d.textContent || '').replace(/\\s+/g, ' ').trim(); if (y) D.bands.push(d.classList.contains('sc-ub-title') ? ('\\u0001' + y) : y); }); return; } const x = (tr.textContent || '').replace(/\\s+/g, ' ').trim(); if (x) D.bands.push(x); }); return; }")
    one('stand bands html', "D.bands.map(x => '<div>' + escapeHtml(x) + '</div>').join('')",
        "D.bands.map(x => (x.charAt(0) === '\\u0001') ? ('<div class=\"bg-ss-band-title\">' + escapeHtml(x.slice(1)) + '</div>') : ('<div>' + escapeHtml(x) + '</div>')).join('')")
    one('twin foot once', "        try { twin.querySelectorAll('table').forEach(x => { x.classList.remove('bg-sc-wide-table'); x.removeAttribute('id'); }); } catch (e) {}\n",
        "        try { twin.querySelectorAll('table').forEach(x => { x.classList.remove('bg-sc-wide-table'); x.removeAttribute('id'); }); } catch (e) {}\n"
        "        // v2091: the \"what these units are from\" box is about the whole round -- once, under the back nine, not under both.\n"
        "        try { const _tt = twin.querySelectorAll('table'); _tt.forEach((x, i) => { if (i < _tt.length - 1) x.querySelectorAll('tr.sc-ub-foot').forEach(r => r.remove()); }); } catch (e) {}\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', n[0], 'edits')
for f in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(f)
