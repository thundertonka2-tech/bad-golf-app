#!/usr/bin/env python3
"""v1973 — Match play card: a player in two 1v1 matches shows both (was: first match only, the other player's row blank)."""
import sys
EDITS = []
EDITS.append(("""    // 1 v 1 Match play — a player sits in the first match that names them.
    if (g.games.match && typeof calcMatch === 'function') {
      const cm = calcMatch(g);
      if (cm && cm.matches && cm.matches.length) {
        kind = 'match'; label = 'Match play';
        cm.matches.forEach(m => {
          if (rows[m.aId] || rows[m.bId]) return;
          const rA = mkRow(), rB = mkRow();
          const up = fill(rA, rB, m.holes.map(h => ({ hole: h.hole, res: h.res })));
          finish(rA, rB, up, m.played, !!m.complete, m.closedHole != null ? m.closedScore : null);
          rows[m.aId] = rA; rows[m.bId] = rB;
        });
      }
    }""",
"""    /* 1 v 1 Match play. v1973 (Tyler, 10/27, LIP15): "Kevin was playing a match play
       against me and against Roland. Why doesn't it show my match with Kevin?" A player
       used to sit in the FIRST match that named them and every other match was dropped --
       so Kevin v Tyler never drew at all and Tyler's row was dots. Every match is built now;
       a player in one match reads as before, a player in several gets each match stacked
       in the cell, tagged with the opponent's initial, and the total names each opponent. */
    if (g.games.match && typeof calcMatch === 'function') {
      const cm = calcMatch(g);
      if (cm && cm.matches && cm.matches.length) {
        kind = 'match'; label = 'Match play';
        const _nameOf = id => { try { const p = g.players.find(x => x && x.id === id); return p ? String(p.name || '') : ''; } catch (e) { return ''; } };
        const _firstOf = id => { const n = _nameOf(id).trim(); return n ? n.split(/\\s+/)[0] : ''; };
        const per = {};   // pid -> [{row, opp}]
        cm.matches.forEach(m => {
          const rA = mkRow(), rB = mkRow();
          const up = fill(rA, rB, m.holes.map(h => ({ hole: h.hole, res: h.res })));
          finish(rA, rB, up, m.played, !!m.complete, m.closedHole != null ? m.closedScore : null);
          (per[m.aId] = per[m.aId] || []).push({ row: rA, opp: m.bId });
          (per[m.bId] = per[m.bId] || []).push({ row: rB, opp: m.aId });
        });
        Object.keys(per).forEach(pid => {
          const list = per[pid];
          if (list.length === 1) { rows[pid] = list[0].row; return; }
          const r = mkRow();
          const ini = x => { const f = _firstOf(x.opp); return f ? f.charAt(0).toUpperCase() : '?'; };
          for (let i = 0; i < 18; i++) {
            const parts = list.filter(x => x.row.cells[i]).map(x => '<span class="sc-mu-' + (x.row.cls[i] || 'as') + '">' + x.row.cells[i] + '</span><small>' + ini(x) + '</small>');
            r.cells[i] = parts.length ? '<span class="sc-mu-multi">' + parts.join('<br>') + '</span>' : '';
            r.cls[i] = 'multi';
          }
          const outParts = list.filter(x => x.row.out).map(x => '<span class="sc-mu-' + (x.row.cls[8] || 'as') + '">' + x.row.out + '</span><small>' + ini(x) + '</small>');
          r.out = outParts.length ? '<span class="sc-mu-multi">' + outParts.join('<br>') + '</span>' : '';
          r.tot = '<span class="sc-mu-multi">' + list.map(x => '<span class="sc-mu-' + (x.row.totCls || 'as') + '">' + (x.row.tot || '\\u2014') + '</span><small>v ' + escapeHtml(_firstOf(x.opp)) + '</small>').join('<br>') + '</span>';
          r.totCls = 'multi';
          r.thru = Math.max.apply(null, list.map(x => x.row.thru || 0));
          rows[pid] = r;
        });
      }
    }""", "model"))
EDITS.append(("""  .sc-mu-tot { font-size: 11px; white-space: nowrap; }""",
"""  .sc-mu-tot { font-size: 11px; white-space: nowrap; }
  /* v1973: a player in two matches -- one line per match, opponent's initial after each */
  .sc-mu-multi { display: inline-block; line-height: 1.15; font-size: 10px; white-space: nowrap; }
  .sc-mu-multi small { font-size: 8px; font-weight: 600; color: var(--text-muted); margin-left: 1px; }
  .sc-mu-multi .sc-mu-up { color: var(--money-pos); } .sc-mu-multi .sc-mu-dn { color: var(--danger-text); }""", "css"))
def patch(p):
    s = open(p, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = s.count(old); assert n == 1, f'{p}: {name}: {n}'
        s = s.replace(old, new)
    s = s.replace("<!--BGVER=v2026.11.1972-->", "<!--BGVER=v2026.11.1973-->").replace("const BG_BUILD = 'v2026.11.1972';", "const BG_BUILD = 'v2026.11.1973';")
    assert s.count('v2026.11.1973') == 2
    open(p, 'w', encoding='utf-8', newline='\n').write(s); print(p, 'ok')
for p in sys.argv[1:]: patch(p)
