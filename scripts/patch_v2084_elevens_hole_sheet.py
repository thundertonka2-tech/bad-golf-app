#!/usr/bin/env python3
# v2026.11.2084 -- 11's: one easy step for the scorer. When the last score of a hole is in, ONE sheet lists
# everyone with Keep / Throw out (par or better starts on Keep, worse on Throw out) and a single Done.
# Also: the 11's card on the score screen now refreshes after a score (it stayed on "Score first"), and a
# hole that was never answered can always be answered (the lock only protects a choice already made).
import sys, io
OLD_V, NEW_V = 'v2026.11.2083', 'v2026.11.2084'
SHEET = r'''/* v2084 (Tyler, 11/27, after a round on the phone): "Once I enter a score it says keep or toss but I have no
   option... We need a very easy process for the scorer to enter the score then click keep or throw."
   His answers: one sheet per hole; the app suggests and the scorer confirms; Score tab and scorecard editor.
   When every score for a hole is in, ONE sheet opens: each player (and each team) with Keep / Throw out,
   par or better starting on Keep and worse on Throw out, and a single Done. Done writes every answer in one
   save and lets the hole advance. "Not now" closes it; the next hole still cannot be scored until it is done. */
var _bgElSheet = { timer: null, hole: 0, picks: {} };
// The rows the sheet shows for hole h: every side of every 11's game that has a score on it.
function bgElevensSheetRows(g, h) {
  const out = [];
  try {
    const adm = (typeof isAdmin === 'function') && isAdmin();
    bgElevensGames(g).forEach(G => {
      G.sides.forEach(s => {
        const c = bgElevensCard(g, G.cfg, s, false), r = c.byHole[h];
        if (!r || r.st === 'none') return;
        const locked = r.st !== 'pending' && !r.forced && bgElevensLocked(c, h) && !adm;
        let detail = '';
        if (!G.team && s.players[0]) {
          const p = s.players[0], gross = (g.scores[p.id] || [])[h - 1], par = Number(parFor(g, p.id, h - 1));
          const net = r.v + par;
          detail = 'made ' + gross + ((G.cfg.net !== false && net !== Number(gross)) ? ' (net ' + net + ')' : '');
        } else detail = 'low ball';
        out.push({ id: G.key + '|' + s.key, game: G.key, label: G.label, team: G.team, field: G.field, side: s.key, name: s.name, v: r.v, st: r.st, forced: !!r.forced, locked: locked,
          editable: !r.forced && !locked, suggest: r.v <= 0 ? 'k' : 'x', detail: detail, kept: c.kept, need: c.need, left: Math.max(0, c.maxOut - c.out) });
      });
    });
  } catch (e) {}
  return out;
}
// A hole is ready for the sheet when every score is in and somebody still owes an answer.
function bgElevensSheetDue(g, h) {
  try {
    if (!g || !h || g.finishedAt && false) return false;
    if (typeof isHoleComplete === 'function' && !isHoleComplete(g, h)) return false;
    const rows = bgElevensSheetRows(g, h);
    return rows.some(r => r.st === 'pending');
  } catch (e) { return false; }
}
// Called after a score goes in. Waits a beat (the scorer may still be tapping + / -), then opens the sheet.
function bgElevensSheetArm(g, h, delayMs) {
  try {
    if (_bgElSheet.timer) { clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; }
    if (!g || !h || state.viewOnlyMode || !bgElevensGames(g).length) return;
    try { if (typeof renderGameBanners === 'function' && document.getElementById('game-banners')) renderGameBanners(); } catch (e) {}   // the card used to stay on "Score first"
    if (!bgElevensSheetDue(g, h)) return;
    _bgElSheet.timer = setTimeout(function () {
      _bgElSheet.timer = null;
      try { const cur = state.game; if (cur && cur.code === g.code && !state.viewOnlyMode && bgElevensSheetDue(cur, h)) bgElevensSheetOpen(h); } catch (e) {}
    }, delayMs == null ? 1400 : delayMs);
  } catch (e) {}
}
function bgElevensSheetClose() {
  try { if (_bgElSheet.timer) { clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; } } catch (e) {}
  try { const ov = document.getElementById('bg-el-sheet'); if (ov) ov.remove(); } catch (e) {}
  _bgElSheet.hole = 0;
}
function bgElevensSheetPick(id, v) {
  try { _bgElSheet.picks[id] = (v === 'x') ? 'x' : 'k'; bgElevensSheetPaint(); } catch (e) {}
}
function bgElevensSheetPaint() {
  try {
    const ov = document.getElementById('bg-el-sheet'), g = state.game, h = _bgElSheet.hole;
    if (!ov || !g || !h) return;
    const rows = bgElevensSheetRows(g, h);
    const par = Array.isArray(g.pars) ? g.pars[h - 1] : '';
    let html = '<h2>Hole ' + h + (par ? ' <span class="small-text">par ' + par + '</span>' : '') + ' — keep or throw out?</h2>'
      + '<div class="help-text">Best ' + bgElevensNeed(g) + ' holes count. Par or better starts on Keep. Change any, then tap Done.</div>';
    let lastGame = '';
    rows.forEach(r => {
      if (r.game !== lastGame) { lastGame = r.game; html += '<h3 class="bg-el-sh-game">' + escapeHtml(r.label) + (r.field ? ' <span class="small-text">whole field</span>' : '') + '</h3>'; }
      const cur = r.editable ? (_bgElSheet.picks[r.id] || (r.st === 'keep' ? 'k' : r.st === 'out' ? 'x' : r.suggest)) : (r.st === 'keep' ? 'k' : 'x');
      if (r.editable) _bgElSheet.picks[r.id] = cur;
      let ctl;
      if (r.forced) ctl = '<span class="small-text">' + (r.st === 'keep' ? 'Counts — no throw-outs left' : 'Not needed — ' + r.need + ' kept') + '</span>';
      else if (r.locked) ctl = '<span class="small-text">🔒 ' + (r.st === 'keep' ? 'Kept' : 'Thrown out') + '</span>';
      else ctl = '<button type="button" class="bg-btn bg-el-sh-btn ' + (cur === 'k' ? 'wolf-sel' : '') + '" data-el-id="' + escapeHtml(r.id) + '" data-el-v="k">Keep</button>'
        + '<button type="button" class="bg-btn bg-el-sh-btn ' + (cur === 'x' ? 'wolf-sel' : '') + '" data-el-id="' + escapeHtml(r.id) + '" data-el-v="x">Throw out</button>';
      html += '<div class="bg-el-sh-row"><div class="bg-el-sh-who"><strong>' + escapeHtml(r.name) + '</strong> <span class="bg-el-sh-val">' + bgElevensToPar(r.v) + '</span>'
        + '<div class="small-text">' + escapeHtml(r.detail) + ' · ' + r.kept + '/' + r.need + ' kept</div></div>'
        + '<div class="bg-el-sh-ctl">' + ctl + '</div></div>';
    });
    const any = rows.some(r => r.editable);
    html += '<div class="bg-el-sh-foot">' + (any ? '<button type="button" class="bg-btn bg-btn--primary" id="bg-el-sh-done">Done</button>' : '')
      + '<button type="button" class="bg-btn bg-btn--ghost" id="bg-el-sh-later">' + (any ? 'Not now' : 'Close') + '</button></div>';
    const box = ov.querySelector('.modal'); box.innerHTML = html;
    box.querySelectorAll('.bg-el-sh-btn').forEach(b => { b.onclick = function () { bgElevensSheetPick(b.dataset.elId, b.dataset.elV); }; });
    const d = box.querySelector('#bg-el-sh-done'); if (d) d.onclick = function () { bgElevensSheetDone(); };
    const l = box.querySelector('#bg-el-sh-later'); if (l) l.onclick = function () { bgElevensSheetClose(); };
  } catch (e) {}
}
function bgElevensSheetOpen(h) {
  try {
    const g = state.game;
    if (!g || !h || state.viewOnlyMode) return false;
    if (!bgElevensSheetRows(g, h).length) return false;
    if (_bgElSheet.timer) { clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; }
    let ov = document.getElementById('bg-el-sheet');
    if (!ov || _bgElSheet.hole !== h) _bgElSheet.picks = {};
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'bg-el-sheet'; ov.className = 'modal-overlay show';
      ov.innerHTML = '<div class="modal bg-el-sh"></div>';
      document.body.appendChild(ov);
    }
    _bgElSheet.hole = h;
    try { if (typeof bgAutoAdvanceCancel === 'function') bgAutoAdvanceCancel(); } catch (e) {}
    bgElevensSheetPaint();
    return true;
  } catch (e) { return false; }
}
// Done: every answer on the sheet in one save, then let the hole move on.
async function bgElevensSheetDone() {
  const g = state.game, h = _bgElSheet.hole;
  try {
    if (!g || !h || state.viewOnlyMode) return bgElevensSheetClose();
    const now = Date.now();
    bgElevensSheetRows(g, h).forEach(r => {
      if (!r.editable) return;
      const v = _bgElSheet.picks[r.id] || r.suggest;
      if (!g.elevensData || typeof g.elevensData !== 'object') g.elevensData = {};
      if (!g.elevensData[r.side] || typeof g.elevensData[r.side] !== 'object') g.elevensData[r.side] = {};
      const was = g.elevensData[r.side][h];
      if (was && was.v === v) return;                                   // unchanged: keep its stamp
      g.elevensData[r.side][h] = { v: v, at: now };
    });
    g.updatedAt = now;
    bgElevensSheetClose();
    try { renderGameBanners(); } catch (e) {}
    try { if (typeof bgAutoAdvanceArm === 'function' && state.currentHole === h) bgAutoAdvanceArm(g, h); } catch (e) {}
    await saveGame(g);
    try { if (typeof renderBoard === 'function' && document.querySelector('#tab-board.active')) renderBoard(); } catch (e) {}
  } catch (e) { try { console.warn('11s sheet save failed', e); } catch (e2) {} bgElevensSheetClose(); }
}
// The hole this player (or his team) still owes an answer on, other than h. 0 = none.
function bgElevensOwedHole(g, pid, h) {
  try {
    const gms = bgElevensGames(g);
    for (let i = 0; i < gms.length; i++) {
      const side = gms[i].sides.find(s => s.players.some(p => p.id === pid)); if (!side) continue;
      const pend = bgElevensCard(g, gms[i].cfg, side, false).rows.find(r => r.st === 'pending' && r.h !== h);
      if (pend) return pend.h;
    }
  } catch (e) {}
  return 0;
}
'''
CSS = '''  /* v2084: the 11's keep / throw out sheet */
  .bg-el-sh { max-width: 460px; width: 94%; }
  .bg-el-sh h2 { margin: 0 0 4px; }
  .bg-el-sh-game { margin: 12px 0 2px; font-size: 14px; }
  .bg-el-sh-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-top: 1px solid var(--border); }
  .bg-el-sh-who { flex: 1; min-width: 0; }
  .bg-el-sh-val { font-weight: 800; color: var(--accent); margin-left: 4px; }
  .bg-el-sh-ctl { display: flex; gap: 6px; flex-shrink: 0; }
  #bg-el-sheet .bg-el-sh-btn { min-height: 46px; width: 100px; padding-left: 4px; padding-right: 4px; white-space: nowrap; }
  #bg-el-sheet .bg-el-sh-btn.wolf-sel { background: var(--accent) !important; border-color: var(--accent) !important; color: #fff !important; font-weight: 800; }
  .bg-el-sh-foot { display: flex; gap: 8px; margin-top: 14px; }
  .bg-el-sh-foot .bg-btn { flex: 1; min-height: 48px; }
'''
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('sheet fns', "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {", SHEET + "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {")
    one('css', "  #gps-elevens-bubble.bg-el-pend {", CSS + "  #gps-elevens-bubble.bg-el-pend {")
    # the lock only protects a choice already made
    one('lock pending', "function bgElevensLocked(card, h) { try { const r = card.byHole[h]; return !!(r && r.st !== 'none' && card.lastPos > r.pos); } catch (e) { return false; } }",
        "function bgElevensLocked(card, h) { try { const r = card.byHole[h]; return !!(r && r.st !== 'none' && r.st !== 'pending' && card.lastPos > r.pos); } catch (e) { return false; } }   // v2084: a hole never answered can always be answered")
    # after a score tap: refresh the card and arm the sheet
    one('arm after score', "function bgAutoAdvanceArm(g, h) {\n", "function bgAutoAdvanceArm(g, h) {\n  try { if (typeof bgElevensSheetArm === 'function' && !document.getElementById('bg-el-sheet')) bgElevensSheetArm(g, h); } catch (e) {}   // v2084: 11's - one sheet per hole\n")
    # the gate opens the sheet for the hole that is owed instead of only saying so
    one('gate opens sheet', "if (_eg) { showToast(_eg, 'warn'); try { renderGameBanners(); } catch (e) {} return; } }   // v2078: 11's - choose before the next hole",
        "if (_eg) { showToast(_eg, 'warn'); try { renderGameBanners(); } catch (e) {} try { const _oh = bgElevensOwedHole(g, pid, state.currentHole); if (_oh) bgElevensSheetOpen(_oh); } catch (e) {} return; } }   // v2078: 11's - choose before the next hole; v2084: and open the sheet for it")
    # scorecard editor: the sheet for the hole just typed
    one('editor', "  try { await saveGame(g); } catch (e) {}\n  // Update just this player's Out/In totals in the open card (no full rebuild,\n", "  try { await saveGame(g); } catch (e) {}\n  try { if (typeof bgElevensSheetArm === 'function') bgElevensSheetArm(g, h + 1, 600); } catch (e) {}   // v2084: 11's - keep / throw out for the hole just typed\n  // Update just this player's Out/In totals in the open card (no full rebuild,\n")
    # the card on the score screen: one button that opens the sheet
    one('banner open', "    banners.appendChild(div);\n    div.querySelectorAll('[data-el-v]').forEach(b => { b.onclick = () => bgElevensSet(b.dataset.elGame, b.dataset.elSide, h, b.dataset.elV); });",
        "    banners.appendChild(div);\n    if (pend) { const ob = document.createElement('button'); ob.type = 'button'; ob.className = 'bg-btn bg-btn--primary bg-el-open'; ob.textContent = 'Keep or throw out \\u2014 hole ' + h; ob.onclick = () => bgElevensSheetOpen(h); div.appendChild(ob); }   // v2084\n    div.querySelectorAll('[data-el-v]').forEach(b => { b.onclick = () => bgElevensSet(b.dataset.elGame, b.dataset.elSide, h, b.dataset.elV); });")
    # Tyler, 11/27: "you put 11's under Extras. We should have this under Single games and then under Team games as Team 11's."
    one('group single', "'quota', 'potofgold', 'splix-sixes']);", "'quota', 'potofgold', 'splix-sixes', 'elevens']);")
    one('group team', "                         'hammer', 'umbrella']);", "                         'hammer', 'umbrella', 'team-elevens']);")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
