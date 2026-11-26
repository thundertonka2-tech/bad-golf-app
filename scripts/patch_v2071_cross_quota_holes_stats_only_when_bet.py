#!/usr/bin/env python3
"""v2071 (Tyler, 11/26, Bad Golf Wednesday 11/25 Games sheet):
1. "Why are the numbers blank for quota here for Kevin and Rolo?" -- the event Matches card drew a cross-group
   Quota bet with the Nassau drawer, which fills the Front / Back sides and skips a 'Total' side (v2045 only
   excepted Stroke play). A Quota bet is one Total side, so every hole stayed a dot. Now: each hole shows the
   points that player made on it, each row ends "27 pts · quota 24 · +3", the header drops net/gross (Quota
   has none), and the cart's own scorecard Match view carries the same line ("Kevin · v Rolo").
2. "If we are not tracking Putts and GIRs for any of the pool games or bets don't show it here. Only show this
   when the putts or girs effect the betting games." -- the Putts & greens table (Games sheet, group and whole
   field, and the settle-up image) prints a column only when a game that pays on it is on: putts for the Fewest
   Putts pool, Snake, Hot Potato (3-putt); greens for the GIR pool, GIR junk, Umbrella. Neither on -> no table.

    python scripts/patch_v2071_cross_quota_holes_stats_only_when_bet.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2070', 'v2026.11.2071'

EDITS = [
  ('engine-qpts',
   """      totals: isQ ? { a: { pts: sa, quota: qA }, b: { pts: sb, quota: qB } } : { a: { strokes: sa }, b: { strokes: sb } } };
  } catch (e) { return null; }""",
   """      qpts: isQ ? { a: _t2CrossQPts(o.qa, S), b: _t2CrossQPts(o.qb, S) } : null,   // v2071: each side's points hole by hole, for the cards
      totals: isQ ? { a: { pts: sa, quota: qA }, b: { pts: sb, quota: qB } } : { a: { strokes: sa }, b: { strokes: sb } } };
  } catch (e) { return null; }"""),
  ('engine-qpts-helper',
   """function _t2SettleCrossTotal(A, B, o) {
  try {""",
   """function _t2CrossQPts(q, S) {   // v2071: { hole: points } on the holes the bet compares
  const out = {};
  try { (S || []).forEach(h => { if (q && q.pts && q.pts[h] != null) out[h] = Number(q.pts[h]) || 0; }); } catch (e) {}
  return out;
}
function _t2SettleCrossTotal(A, B, o) {
  try {"""),
  ('model-cells',
   """      const segs = (n.segments || []).map(s => { const r = _t2CrossSegLine(s, n, L); return { name: s.name === 'Total' ? '18' : s.name, text: r.text, cls: r.state === 'none' ? 'none' : 'as', state: r.state }; });
      if (!segs.length) segs.push({ name: 'Front', text: _sT('Not started'), cls: 'none', state: 'none' });
      const units = (k) => (k === n.aKey ? n.aNet : n.bNet) || 0;""",
   """      /* v2071 (Tyler, 11/26: "Why are the numbers blank for quota here for Kevin and Rolo?"): a cross Quota bet is one
         Total side, which the loop above skips. Its hole row is each player's points on that hole, and each row ends
         with his line -- "27 pts · quota 24 · +3" (the quota is the one the bet used, cut to the holes compared). */
      if (n.xkind === 'quota') {
        try {
          const qp = n.qpts || {};
          cols.forEach((h, i) => {
            const pa = qp.a ? qp.a[h] : null, pb = qp.b ? qp.b[h] : null;
            if (pa != null) { ra.cells[i] = String(pa); ra.cls[i] = 'as'; }
            if (pb != null) { rb.cells[i] = String(pb); rb.cls[i] = 'as'; }
          });
          const T = n.totals || {};
          const ln = s => (s && s.pts != null && s.quota != null && typeof _bgQFootHtml === 'function') ? _bgQFootHtml({ pts: s.pts, quota: s.quota, diff: s.pts - s.quota }, null) : '';
          ra.totHtml = ln(T.a); rb.totHtml = ln(T.b);
        } catch (e) {}
      }
      const segs = (n.segments || []).map(s => { const r = _t2CrossSegLine(s, n, L); return { name: s.name === 'Total' ? '18' : s.name, text: r.text, cls: r.state === 'none' ? 'none' : 'as', state: r.state }; });
      if (!segs.length) segs.push({ name: 'Front', text: _sT('Not started'), cls: 'none', state: 'none' });
      const units = (k) => (k === n.aKey ? n.aNet : n.bNet) || 0;"""),
  ('card-title',
   """        const title = kindLbl + tags + ' <span class="small-text" style="color:var(--text-muted);font-weight:400">· ' + escapeHtml(m.net ? _sT('net') : _sT('gross')) + (m.value ?""",
   """        const title = kindLbl + tags + ' <span class="small-text" style="color:var(--text-muted);font-weight:400">' + (m.xkind === 'quota' ? '' : ('· ' + escapeHtml(m.net ? _sT('net') : _sT('gross')))) /* v2071: Quota has no net or gross */ + (m.value ?"""),
  ('card-row-end',
   """          h += '<td style="' + cell + '">' + ((m.kind === 'nassau') ? '' : '<span class""",
   """          h += '<td style="' + cell + '">' + ((m.kind === 'nassau') ? (side.totHtml ? '<span class="sc-q-line" style="white-space:nowrap">' + side.totHtml + '</span>' : '') /* v2071 */ : '<span class"""),
  ('group-card-row',
   """        (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true });
      });
    });
    return Object.keys(out).length ? out : null;""",
   """        (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true });
      });
    });
    /* v2071 (Tyler, 11/26): a cross Quota bet gets the same labelled line -- his points on each hole the bet
       compares, ending with his result against the quota the bet used. */
    (X.nassaus || []).forEach(n => {
      try {
        if (n.xkind !== 'quota' || !n.qpts) return;
        if (n.day != null && Number(n.day) !== day) return;
        [[n.aKey, n.bKey, 'a'], [n.bKey, n.aKey, 'b']].forEach(([mk, ok, side]) => {
          const p = byKey[mk]; if (!p || byKey[ok]) return;
          const r = mkRow(); let last = 0, o9 = 0, any9 = false;
          const qp = n.qpts[side] || {};
          Object.keys(qp).forEach(h => {
            const sl = slotOf[Number(h)]; if (!sl) return;
            r.cells[sl - 1] = String(qp[h]); r.cls[sl - 1] = 'as'; last = Math.max(last, sl);
            if (sl <= 9) { o9 += Number(qp[h]) || 0; any9 = true; }
          });
          if (any9) r.out = String(o9);
          r.thru = last;
          const T = (n.totals || {})[side];
          if (n.notStarted || !T || T.pts == null || T.quota == null) { r.tot = '—'; r.totCls = 'as'; }
          else { const d = T.pts - T.quota; r.tot = (d > 0 ? '+' : (d < 0 ? '−' : '')) + (d === 0 ? 'E' : Math.abs(d)); r.totCls = d > 0 ? 'up' : (d < 0 ? 'dn' : 'as'); }
          (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true });
        });
      } catch (e) {}
    });
    return Object.keys(out).length ? out : null;"""),
  ('stats-helper',
   """function bgStatRowsForRounds(rounds) {
  try {
    const list = (rounds || []).map(function (r) { return (r && r.data) ? r.data : r; })
                 .filter(function (rg) { return rg && Array.isArray(rg.players) && rg.players.length; });
    const by = {}; let anyPutts = false, anyGir = false;""",
   """/* v2071 (Tyler, 11/26): "if we are not tracking Putts and GIRs for any of the pool games or bets don't show it
   here. Only show this when the putts or girs effect the betting games." Which of the two a game on these
   rounds (or the event's own pools) actually pays on. */
function bgStatBetUse(rounds, t) {
  const u = { putts: false, gir: false };
  try {
    (rounds || []).forEach(function (r) {
      const g = (r && r.data) ? r.data : r; if (!g) return;
      [g.games, g.groupGames].forEach(function (gm) {
        if (!gm || typeof gm !== 'object') return;
        if (gm.puttsPool) u.putts = true;
        if (gm.girPool) u.gir = true;
        if (gm.umbrella) u.gir = true;
        if (gm.hotPotato && gm.hotPotato.mode !== 'double') u.putts = true;
        const j = gm.junk;
        if (j && typeof j === 'object') {
          if ((Number(j.snake) || 0) > 0) u.putts = true;
          if (j.gir != null && j.gir !== false) u.gir = true;
        }
      });
    });
    if (t) {
      const sp = (typeof t2EffectiveSidePots === 'function') ? t2EffectiveSidePots(t) : null;
      if (sp && sp.putts && sp.putts.on) u.putts = true;
      if (sp && sp.girs && sp.girs.on) u.gir = true;
    }
  } catch (e) {}
  return u;
}
function bgStatRowsForRounds(rounds, opt) {
  try {
    const list = (rounds || []).map(function (r) { return (r && r.data) ? r.data : r; })
                 .filter(function (rg) { return rg && Array.isArray(rg.players) && rg.players.length; });
    const _use = bgStatBetUse(list, opt && opt.t);   // v2071
    if (!_use.putts && !_use.gir) return [];
    const by = {}; let anyPutts = false, anyGir = false;"""),
  ('stats-filter',
   """    const out = Object.keys(by).map(function (k) { return by[k]; })
                 .filter(function (r) { return r.puttHoles || r.girHoles; });
    /* Fewest putts first""",
   """    if (!_use.putts) { anyPutts = false; Object.keys(by).forEach(function (k) { by[k].putts = 0; by[k].puttHoles = 0; }); }   // v2071: only the column a game pays on
    if (!_use.gir) { anyGir = false; Object.keys(by).forEach(function (k) { by[k].girs = 0; by[k].girHoles = 0; }); }
    const out = Object.keys(by).map(function (k) { return by[k]; })
                 .filter(function (r) { return r.puttHoles || r.girHoles; });
    /* Fewest putts first"""),
  ('stats-single',
   """function bgStatRowsForRound(g) { return bgStatRowsForRounds([g]); }""",
   """function bgStatRowsForRound(g, opt) { return bgStatRowsForRounds([g], opt); }"""),
  ('sheet-field',
   """      try { _fieldStatHtml = bgStatTableHtml(bgStatRowsForRounds(_raw)) || ''; } catch (e) {}   // v1305""",
   """      try { _fieldStatHtml = bgStatTableHtml(bgStatRowsForRounds(_raw, { t: t })) || ''; } catch (e) {}   // v1305; v2071: only when a game pays on putts / greens
      try { _grpStatHtml = bgStatTableHtml(bgStatRowsForRound(g, { t: t })) || ''; } catch (e) {}   // v2071: the cart's table knows the event's pools too"""),
  ('image-field',
   """      statRows = bgStatRowsForRounds(raw);""",
   """      statRows = bgStatRowsForRounds(raw, { t: t });   // v2071"""),
]

def main():
    for f in FILES:
        src = open(f, encoding='utf-8', newline='').read()
        crlf = '\r\n' in src
        if crlf: src = src.replace('\r\n', '\n')
        for name, old, new in EDITS:
            c = src.count(old)
            assert c == 1, '%s: %s matched %d times' % (os.path.basename(f), name, c)
            src = src.replace(old, new)
        assert src.count(OLD_V) == 2, '%s: version markers %d' % (f, src.count(OLD_V))
        src = src.replace(OLD_V, NEW_V)
        if crlf: src = src.replace('\n', '\r\n')
        open(f, 'w', encoding='utf-8', newline='').write(src)
        print('patched', os.path.relpath(f, ROOT))

if __name__ == '__main__':
    main()
