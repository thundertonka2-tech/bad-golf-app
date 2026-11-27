#!/usr/bin/env python3
# v2026.11.2080 -- 11's: a GPS bubble (the tournament pool wins over a group's own), an 11's tab on every
# scorecard that has tabs (kept holes in strokes, thrown-out holes crossed out), and a summary line.
import sys, io
OLD_V, NEW_V = 'v2026.11.2079', 'v2026.11.2080'

ENG = r'''/* v2080 (Tyler, 11/26): "add the GPS bubbles, if there is a tourney 11's and a group 11's show the tourney
   bubble on the GPS screen since it is the main game... make sure the summary screen have this data and we
   have a tab for 11's like we do quota."  Display only: every number is bgElevensCard / the field engine. */
function bgElevensFieldPlace(g, G, myId) {
  try {
    const tid = g && g.t2 && g.t2.tournamentId; if (!tid) return null;
    try { if (typeof _t2RefreshCrossGpsCache === 'function') Promise.resolve(_t2RefreshCrossGpsCache(g)).catch(() => {}); } catch (e) {}
    const cache = window._t2CrossGps;
    if (!cache || cache.tid !== tid) return null;
    const me = (g.players || []).find(p => p && p.id === myId); if (!me || !me.name) return null;
    let hit = false;
    const rows = (cache.rows || []).map(r => { const d = r && r.data ? r.data : r; if (d && d.code === g.code) { hit = true; return { data: g }; } return r; });
    if (!hit) rows.push({ data: g });
    return bgElevensFieldPlaceFrom(rows, G.team, Number((g.t2 && g.t2.day) || 1), me.name);
  } catch (e) { return null; }
}
function bgElevensFieldPlaceFrom(rows, team, day, myName) {
  try {
    const r = team ? t2ComputeFieldTeamElevens(rows) : t2ComputeFieldElevens(rows);
    if (!r || !Array.isArray(r.perDay)) return null;
    const k = normalizeNameSegment(String(myName || ''));
    let D = null, me = null;
    r.perDay.forEach(d => { if (D || Number(d.day) !== Number(day)) return; const m = (d.rows || []).find(x => normalizeNameSegment(String(x.name)) === k); if (m) { D = d; me = m; } });
    if (!D || !me) return null;
    return { place: me.pos || 0, tied: !!me.tied, n: D.entries, total: me.total, kept: me.kept, need: me.need, done: !!me.done, complete: D.complete !== false };
  } catch (e) { return null; }
}
// What the GPS bubble says for this player. The event's pool is the main game: it wins over a cart's own.
function bgElevensGpsInfo(g, myId) {
  try {
    if (!g || !myId) return null;
    const mine = bgElevensGames(g).filter(G => G.sides.some(s => s.players.some(p => p.id === myId)));
    if (!mine.length) return null;
    mine.sort((a, b) => ((b.field ? 1 : 0) - (a.field ? 1 : 0)) || ((a.team ? 1 : 0) - (b.team ? 1 : 0)));
    const G = mine[0], side = G.sides.find(s => s.players.some(p => p.id === myId));
    const c = bgElevensCard(g, G.cfg, side, !!g.finishedAt);
    const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th');
    const out = { key: G.key, label: G.label, field: G.field, team: G.team, total: c.total, kept: c.kept, need: c.need, done: c.done, pending: c.pending, val: '—', sub: c.kept + '/' + c.need };
    if (c.kept) out.val = String(c.total);
    if (c.done) {
      let place = 0, tied = false, n = 0;
      if (G.field) { const fp = bgElevensFieldPlace(g, G, myId); if (fp && fp.place) { place = fp.place; tied = fp.tied; n = fp.n; } }
      else {
        const done = G.sides.map(s => bgElevensCard(g, G.cfg, s, !!g.finishedAt)).filter(x => x.done);
        if (done.length >= 2) { place = done.filter(x => x.total < c.total).length + 1; tied = done.filter(x => x.total === c.total).length > 1; n = G.sides.length; }
      }
      if (place) { out.place = place; out.tied = tied; out.n = n; out.val = (tied ? 'T' : '') + ord(place); out.sub = 'of ' + n; }
      else out.sub = 'done';
    }
    out.title = G.label + (G.field ? ' — the whole tournament' : '') + ': ' + (c.kept ? c.total + ' strokes, ' : '') + c.kept + ' of ' + c.need + ' holes kept' + (c.pending ? ' — a hole needs keep or throw out' : '');
    return out;
  } catch (e) { return null; }
}
// The 11's tab: each kept hole in strokes, each thrown-out hole crossed out, then "42 strokes · 11/11 kept · 1st".
function _bgElRank(rows, ids) {
  ids.forEach(id => {
    const r = rows[id]; if (!r) return;
    if (!r.done) { r.rank = 0; r.tied = false; return; }
    const seen = {}; let above = 0, same = 0;
    ids.forEach(o => { const x = rows[o]; if (!x || !x.done || seen[x.sk]) return; seen[x.sk] = 1; if (x.pts < r.pts - 1e-9) above++; else if (Math.abs(x.pts - r.pts) < 1e-9) same++; });
    r.rank = above + 1; r.tied = same > 1;
  });
}
function _bgElFootHtml(pm, r) {
  const T = s => (typeof bgT === 'function') ? bgT(s) : s;
  return (r.team ? escapeHtml(r.team) + ' · ' : '') + '<b class="sc-q-pts">' + r.pts + '</b> ' + escapeHtml(T('strokes')) + ' · ' + r.kept + '/' + r.need + ' ' + escapeHtml(T('kept'))
    + (r.rank ? ' · <span class="sc-mu sc-mu-' + (r.rank === 1 ? 'up' : 'as') + ' sc-q-diff">' + escapeHtml(_bgPtPlace(r.rank, r.tied)) + '</span>' : '');
}
function bgElevensCardModels(g) {
  const out = [];
  try {
    if (!g || !Array.isArray(g.players) || !g.players.length || g._bgTeamCard) return out;
    const src = g._noGroupGames ? Object.assign({}, g, { groupGames: null }) : g;
    bgElevensGames(src).forEach(G => {
      const fin = !!g.finishedAt, rows = {}, ids = [];
      G.sides.forEach(s => {
        const c = bgElevensCard(g, G.cfg, s, fin), sk = String(g.code || '') + ':' + s.key;
        s.players.forEach(p => {
          const cells = new Array(18).fill(null), html = new Array(18).fill(null);
          let outN = 0, innN = 0, outAny = false, inAny = false;
          c.rows.forEach(r => {
            if (r.st === 'none') return; const i = r.h - 1;
            if (r.st === 'keep') { cells[i] = r.v; if (i < 9) { outN += r.v; outAny = true; } else { innN += r.v; inAny = true; } html[i] = '<span class="sc-mu sc-mu-as sc-q-pt">' + r.v + '</span>'; }
            else if (r.st === 'out') html[i] = '<span class="sc-mu sc-mu-none sc-el-x"><s>' + r.v + '</s></span>';
            else html[i] = '<span class="sc-mu sc-mu-none sc-el-q">' + r.v + '?</span>';
          });
          rows[p.id] = { cells: cells, cellHtml: html, outN: outN, innN: innN, outAny: outAny, inAny: inAny, pts: c.total, any: c.scored > 0, kept: c.kept, need: c.need, done: c.done, sk: sk, team: G.team ? s.name : '' };
          ids.push(p.id);
        });
      });
      if (!ids.length) return;
      _bgElRank(rows, ids);
      const need = bgElevensNeed(g), net = G.cfg.net !== false;
      out.push({ key: G.key, mode: 'pt:' + G.key, label: G.label, kind: 'low', unit: 'strokes', low: true, rows: rows, ids: ids, nH: ((typeof roundHoles === 'function') ? roundHoles(g) : 18) || 18,
        cap: G.label + ': best ' + need + ' holes, ' + (net ? 'net' : 'gross') + ' strokes' + (G.team ? ', team low ball' : '') + '. Kept holes count; crossed-out holes were thrown out; low total wins.' + (G.field ? ' One pool across the whole field.' : ''),
        early: null, field: G.field });
    });
  } catch (e) {}
  return out;
}
function bgPointsCardModels(g) {
  const base = _bgPointsCardModelsBase(g) || [];
  if (g && g._bgPtsField !== undefined) return base;
  let ex = []; try { ex = bgElevensCardModels(g); } catch (e) { ex = []; }
  return ex.length ? base.concat(ex) : base;
}
'''

BUBBLE_FN = r'''  // v2080: 11's bubble -- my strokes over the kept holes while I am still choosing ("38" over "7/11"),
  // then my place ("T2nd" over "of 14"). The event's whole-field pool wins over a cart's own game.
  function updateElevensBubble() {
    const b = el('gps-elevens-bubble');
    if (!b) return;
    const hide = () => { b.style.display = 'none'; };
    try {
      if (mode !== 'view') return hide();
      const g = state.game;
      if (!g || typeof bgElevensGpsInfo !== 'function') return hide();
      const myId = spectate ? spectate.pid : gpsResolveMyId(g);
      if (!myId) return hide();
      const I = bgElevensGpsInfo(g, myId);
      if (!I) return hide();
      const v = b.querySelector('.val'); if (v) v.textContent = I.val;
      const s = b.querySelector('.sub'); if (s) s.textContent = I.sub;
      _bgBubbleLbl(b.querySelector('.lbl'), I.key, I.label);
      b.title = I.title;
      b.classList.toggle('bg-el-pend', !!I.pending);
      b.style.display = 'block';
    } catch (e) { hide(); }
  }
'''

def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 2, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new, cnt=1):
        nonlocal src
        c = src.count(old); assert c == cnt, (path, name, c, 'expected', cnt)
        src = src.replace(old, new); n[0] += 1
    one('rename base', "function bgPointsCardModels(g) {\n  try {\n    if (g && g._bgPtsField !== undefined) return g._bgPtsField || [];", "function _bgPointsCardModelsBase(g) {\n  try {\n    if (g && g._bgPtsField !== undefined) return g._bgPtsField || [];")
    one('engine', "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {", ENG + "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {")
    one('cell html', "  if (c.hole) return _bgPtCellHtml(r.cells[c.hole - 1]);", "  if (c.hole) return (r.cellHtml && r.cellHtml[c.hole - 1] != null) ? r.cellHtml[c.hole - 1] : _bgPtCellHtml(r.cells[c.hole - 1]);   // v2080: 11's draws its own cells")
    one('foot html', "function _bgPtFootHtml(pm, r) {\n", "function _bgPtFootHtml(pm, r) {\n  if (pm && pm.low) return _bgElFootHtml(pm, r);   // v2080: 11's - strokes, holes kept, place\n")
    one('field models skip', "      (bgPointsCardModels(g) || []).forEach(m => {\n        let F = by[m.key];", "      (bgPointsCardModels(g) || []).forEach(m => {\n        if (m.low && !m.field) return;   // v2080: a cart's own 11's is not a field standing\n        let F = by[m.key];")
    one('field models low', "unit: m.unit, rows: {}, ids: [], nH: 18, cap: m.cap, early: null, field: true, _e: {} };", "unit: m.unit, low: !!m.low, rows: {}, ids: [], nH: 18, cap: m.cap, early: null, field: true, _e: {} };")
    one('field rank', "      _bgPtRank(F.rows, F.ids);\n      return F;", "      (F.low ? _bgElRank : _bgPtRank)(F.rows, F.ids);\n      return F;")
    one('summary line', "    if (k === 'lowNetPool' || k === 'elevens' || k === 'teamElevens' || k === 'girPool' || k === 'puttsPool' || k === 'ctp' ||",
        "    if (k === 'elevens') {   // v2080: every finished card, low to high\n      const st = (Array.isArray(r.standings) ? r.standings : []).filter(x => x && x.done).sort((a, b) => a.total - b.total);\n      if (!st.length) return '';\n      return 'Best ' + (r.need || 11) + ' holes — ' + st.map(x => x.name + ' ' + x.total).join(' · ');\n    }\n    if (k === 'teamElevens') {\n      if (r.aTotal == null || r.bTotal == null) return '';\n      return r.teamA + ' ' + r.aTotal + ' v ' + r.teamB + ' ' + r.bTotal + (r.winner === 'Tie' ? ' — tied' : ' — ' + r.winner + ' win');\n    }\n    if (k === 'lowNetPool' || k === 'girPool' || k === 'puttsPool' || k === 'ctp' ||")
    # GPS bubble
    one('bubble html', '    <div id="gps-stableford-bubble" title="Stableford — your total points">',
        '    <div id="gps-elevens-bubble" title="11\'s — your strokes over the holes you kept">\n      <div class="lbl"><span class="bic" role="img" aria-label="11\'s">\U0001F522</span></div>\n      <div class="val">—</div>\n      <div class="sub">—</div>\n    </div>\n    <div id="gps-stableford-bubble" title="Stableford — your total points">')
    one('css box', "#gps-quota-bubble, #gps-stableford-bubble, #gps-bbb-bubble, #gps-nassau-bubble, #gps-pog-bubble {", "#gps-quota-bubble, #gps-elevens-bubble, #gps-stableford-bubble, #gps-bbb-bubble, #gps-nassau-bubble, #gps-pog-bubble {")
    one('css lbl', "#gps-quota-bubble .lbl, #gps-stableford-bubble .lbl,", "#gps-quota-bubble .lbl, #gps-elevens-bubble .lbl, #gps-stableford-bubble .lbl,")
    one('css val', "#gps-quota-bubble .val, #gps-stableford-bubble .val,", "#gps-quota-bubble .val, #gps-elevens-bubble .val, #gps-stableford-bubble .val,")
    one('css sub', "  #gps-bbb-bubble .sub, #gps-nassau-bubble .sub,", "  #gps-elevens-bubble.bg-el-pend { border-color: var(--warn, var(--gold)); }\n  .sc-el-x s { opacity: 0.55; }\n  #gps-elevens-bubble .sub, #gps-bbb-bubble .sub, #gps-nassau-bubble .sub,")
    one('bubble fn', "  // Stableford bubble: show MY total Stableford points (label \"STBLFD\", val \"14\").\n  function updateStablefordBubble() {", BUBBLE_FN + "  // Stableford bubble: show MY total Stableford points (label \"STBLFD\", val \"14\").\n  function updateStablefordBubble() {")
    one('bubble call', "      try { updateStablefordBubble(); } catch (e) {}\n", "      try { updateStablefordBubble(); } catch (e) {}\n      try { updateElevensBubble(); } catch (e) {}   // v2080\n")
    one('bubble tap', "    { const _sb = el('gps-stableford-bubble'); if (_sb) _sb.onclick = () => {", "    { const _eb = el('gps-elevens-bubble'); if (_eb) _eb.onclick = () => { try { try { state._gpsReturn = (state.game && state.currentHole != null) ? state.currentHole : true; } catch (e2) {} close(); if (typeof switchTab === 'function') switchTab('board'); } catch (e) {} }; }   // v2080: tap = the Board, where the 11's standings are\n    { const _sb = el('gps-stableford-bubble'); if (_sb) _sb.onclick = () => {")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
