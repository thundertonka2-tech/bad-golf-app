#!/usr/bin/env python3
# v2026.11.2085 -- from the "Frosty Post Turkey Day" event (11/27):
#  1. A cross Quota (or Stroke play) bet was labelled "Nassau" in the event payouts. It now says what it is.
#  2. A cross bet for 0 units between Quota / Stroke players was left off the per-game breakdown. It now shows W / L / AS.
#  3. Cross Quota bets sat under the Match tab on the scorecard. They are now under a Quota tab (points per hole,
#     "27 pts . quota 24 . +3", then a line per bet: "v Rolo . +3 v -2 . won").
#  4. A player whose playing handicap is 0 (the low man when strokes come off the low handicap) showed no number. Now "(0)".
import sys, io
OLD_V, NEW_V = 'v2026.11.2084', 'v2026.11.2085'
XQ = r'''/* v2085 (Tyler, 11/27): "on the scoring screen you listed the quota games we were playing under the matches tab.
   Can you make a quota's tab instead and put the quota games under there?"  A cross-group Quota bet now feeds the
   Quota tab: the player's points per hole in his own row, his "pts . quota . +/-" line, and one line per bet.
   Display only -- every number is the cross engine's (n.qpts / n.totals). */
function bgQuotaCrossModel(g) {
  try {
    if (!g || !(g.t2 && g.t2.tournamentId) || !Array.isArray(g.players)) return null;
    const cache = window._t2CrossGps;
    if (!cache || cache.tid !== g.t2.tournamentId || !cache.t) {
      try { if (typeof _t2RefreshCrossGpsCache === 'function') Promise.resolve(_t2RefreshCrossGpsCache(g)).catch(() => {}); } catch (e) {}
      return null;
    }
    const X = _t2CrossFromCache(cache, g); if (!X) return null;
    const L = X.labels, day = Number(g.t2.day || 1);
    const nH = (typeof roundHoles === 'function') ? (roundHoles(g) || 18) : 18;
    const slotOf = {};
    for (let s = 1; s <= nH; s++) { let ph = s; try { ph = (typeof bgPhysHole === 'function') ? bgPhysHole(g, s) : s; } catch (e) { ph = s; } if (slotOf[ph] == null) slotOf[ph] = s; }
    const byKey = {}; g.players.forEach(p => { if (p && p.name) byKey[_t2SKey(p.name)] = p; });
    const rows = {}, bets = {};
    (X.nassaus || []).forEach(n => {
      try {
        if (n.xkind !== 'quota' || !n.qpts) return;
        if (n.day != null && Number(n.day) !== day) return;
        [[n.aKey, n.bKey, 'a', 'b'], [n.bKey, n.aKey, 'b', 'a']].forEach(a => {
          const p = byKey[a[0]]; if (!p || byKey[a[1]]) return;      // a cart-mate pair is the group's own game
          const T = (n.totals || {})[a[2]], O = (n.totals || {})[a[3]];
          if (!rows[p.id] && T && T.pts != null && T.quota != null) {
            const cells = new Array(18).fill(null); let outN = 0, innN = 0, outAny = false, inAny = false;
            const qp = n.qpts[a[2]] || {};
            Object.keys(qp).forEach(h => { const sl = slotOf[Number(h)]; if (!sl) return; const v = Number(qp[h]) || 0; cells[sl - 1] = v; if (sl <= 9) { outN += v; outAny = true; } else { innN += v; inAny = true; } });
            rows[p.id] = { cells: cells, outN: outN, innN: innN, outAny: outAny, inAny: inAny, pts: T.pts, quota: T.quota, diff: T.pts - T.quota, any: outAny || inAny, left: null, cross: true };
          }
          const my = (T && T.pts != null && T.quota != null) ? T.pts - T.quota : null, his = (O && O.pts != null && O.quota != null) ? O.pts - O.quota : null;
          (bets[p.id] = bets[p.id] || []).push({ opp: L.first(a[1]), my: my, his: his, value: Number(n.value) || 0, pending: !!(n.pending || n.notStarted || n.settled === false) });
        });
      } catch (e) {}
    });
    return (Object.keys(rows).length || Object.keys(bets).length) ? { rows: rows, bets: bets } : null;
  } catch (e) { return null; }
}
function _bgQXbetHtml(bt) {
  const T = s => (typeof bgT === 'function') ? bgT(s) : s;
  let res = '';
  if (bt.my == null || bt.his == null) res = T('not started');
  else if (bt.pending) res = bt.my === bt.his ? T('level so far') : (bt.my > bt.his ? T('ahead') : T('behind'));
  else res = bt.my === bt.his ? T('tied') : (bt.my > bt.his ? T('won') : T('lost'));
  const cls = (bt.my == null || bt.his == null || bt.my === bt.his) ? 'as' : (bt.my > bt.his ? 'up' : 'dn');
  return '🎯 <b>v ' + escapeHtml(bt.opp || '?') + '</b>'
    + ((bt.my != null && bt.his != null) ? ' · ' + _bgQSign(bt.my) + ' v ' + _bgQSign(bt.his) : '')
    + ' · <span class="sc-mu sc-mu-' + cls + ' sc-q-diff">' + escapeHtml(res) + '</span>'
    + (bt.value ? ' · ' + bt.value : '');
}
function bgQuotaCardModel(g) {
  const base = _bgQuotaCardModelBase(g);
  if (g && g._bgQuotaField) return base;
  let x = null; try { x = bgQuotaCrossModel(g); } catch (e) { x = null; }
  if (!x) return base;
  const m = base ? Object.assign({}, base, { rows: Object.assign({}, base.rows) }) : { rows: {}, teams: [], label: 'Quota', early: null };
  Object.keys(x.rows).forEach(pid => { if (!m.rows[pid]) m.rows[pid] = x.rows[pid]; });
  m.xbets = x.bets;
  return Object.keys(m.rows).length ? m : base;
}
function _bgQuotaCardModelBase(g) {'''
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    # 1. the label
    one('label', "        try { const _it = crossItem('Nassau', [{ key: ak, first: n.aFirst }, { key: bk, first: n.bFirst }]); _it.money[ak] = n.aNet || 0; _it.money[bk] = n.bNet || 0;",
        "        let _nIt = null;   // v2085\n        try { const _it = _nIt = crossItem(n.xkind === 'quota' ? 'Quota' : (n.xkind === 'stroke' ? 'Stroke play' : 'Nassau'), [{ key: ak, first: n.aFirst }, { key: bk, first: n.bFirst }]); _it.money[ak] = n.aNet || 0; _it.money[bk] = n.bNet || 0;   // v2085 (Tyler, 11/27): a cross Quota bet was called \"Nassau\"")
    # 2. zero units: the bet still shows, with who won
    one('zero unit item', "            if (aWins !== bWins) { markGame('Cross-group games', ak, aWins > bWins ? 'W' : 'L'); markGame('Cross-group games', bk, bWins > aWins ? 'W' : 'L'); }\n            else if (aWins || bWins) { markGame('Cross-group games', ak, 'AS'); markGame('Cross-group games', bk, 'AS'); }",
        "            if (aWins !== bWins) { markGame('Cross-group games', ak, aWins > bWins ? 'W' : 'L'); markGame('Cross-group games', bk, bWins > aWins ? 'W' : 'L'); }\n            else if (aWins || bWins) { markGame('Cross-group games', ak, 'AS'); markGame('Cross-group games', bk, 'AS'); }\n            // v2085 (Tyler, 11/27): \"me and Kevin had a quota game and I don't see it here although it was for zero dollars.\"\n            if (_nIt && !n.pending && !n.notStarted && n.settled !== false) { _nIt.marks[ak] = aWins > bWins ? 'W' : (bWins > aWins ? 'L' : 'AS'); _nIt.marks[bk] = bWins > aWins ? 'W' : (aWins > bWins ? 'L' : 'AS'); }")
    # 3. the Quota tab
    one('tag quota lines', "          (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true });\n        });\n      } catch (e) {}",
        "          (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true, quota: true });\n        });\n      } catch (e) {}")
    one('match drops quota', "    let _scCross = null; try { _scCross = (typeof _t2ScCrossRows === 'function') ? _t2ScCrossRows(g, mkRow) : null; } catch (e) { _scCross = null; }   // v2010 (decision 9)",
        "    let _scCross = null; try { _scCross = (typeof _t2ScCrossRows === 'function') ? _t2ScCrossRows(g, mkRow) : null; } catch (e) { _scCross = null; }   // v2010 (decision 9)\n    try { if (_scCross) { Object.keys(_scCross).forEach(pid => { _scCross[pid] = (_scCross[pid] || []).filter(x => !x.quota); if (!_scCross[pid].length) delete _scCross[pid]; }); if (!Object.keys(_scCross).length) _scCross = null; } } catch (e) {}   // v2085: cross Quota bets live on the Quota tab")
    one('quota model wrap', "function bgQuotaCardModel(g) {", XQ)
    one('field model base', "      const m = bgQuotaCardModel(g); if (!m) return;", "      const m = _bgQuotaCardModelBase(g); if (!m) return;   // v2085: the field card is the pool, not the cross bets")
    one('bet lines', "          tr.parentNode.insertBefore(f, tr.nextSibling);",
        "          tr.parentNode.insertBefore(f, tr.nextSibling);\n          try { ((qModel.xbets && qModel.xbets[tr.dataset.pid]) || []).slice().reverse().forEach(bt => { const xr = document.createElement('tr'); xr.className = 'sc-q-foot sc-q-xbet'; xr.dataset.qpid = tr.dataset.pid; xr.innerHTML = '<td colspan=\"' + nCols + '\"><span class=\"sc-q-line\">' + _bgQXbetHtml(bt) + '</span></td>'; tr.parentNode.insertBefore(xr, f.nextSibling); }); } catch (e) {}   // v2085: one line per cross Quota bet")
    # 4. handicap 0
    one('hcp 0', "    if (!n) return '';\n    return '<span class=\"sc-hcp\">(' + n + ')</span>';",
        "    /* v2085 (Tyler, 11/27): \"we cannot see Larry's handicap.\" With strokes off the low handicap the low man plays\n       off 0, and a 0 printed nothing -- so his row looked like it had no handicap at all. Print the 0. */\n    return '<span class=\"sc-hcp\">(' + n + ')</span>';")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
