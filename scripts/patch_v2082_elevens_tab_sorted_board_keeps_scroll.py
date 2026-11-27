#!/usr/bin/env python3
# v2026.11.2082 -- (1) the 11's / Team 11's tab lists players 1st to last, place in front of each line (like
# Quota); (2) the event leaderboard no longer jumps to the top when it refreshes itself (every 15 s) --
# Tyler tapped the 11's tab on the Full scorecard and "it kicked me back up".
import sys, io
OLD_V, NEW_V = 'v2026.11.2081', 'v2026.11.2082'
ORDER = r'''/* v2082 (Tyler, 11/26, on the 11's tab): "this should be sorted by place." Same idea as the Quota tab: on an
   11's / Team 11's tab the player rows (each with its lines) run 1st to last -- finished cards by place, then
   cards still in progress by holes kept; every other tab puts the card back in its own order. */
function _bgScLowOrder(table, mode) {
  try {
    if (mode === 'quota') return;   // the Quota tab has its own order
    const bodies = Array.from(table.querySelectorAll('tbody')).filter(b => !b.classList.contains('sc-units-band'));
    bodies.forEach(tb => {
      const rows = Array.from(tb.children).filter(r => r.tagName === 'TR');
      if (!rows.length || !rows.some(r => r.dataset.elPts != null)) return;
      rows.forEach((r, i) => { if (r.dataset.scOrd == null) r.dataset.scOrd = String(i); });
      const on = rows.some(r => r.dataset.elPts != null && r.dataset.pmode === mode);
      const groups = []; let cur = null;
      rows.forEach(r => {
        if (r.dataset.pid && !r.dataset.scExtra) { cur = { head: r, tail: [] }; groups.push(cur); }
        else if (cur && (r.dataset.scExtra || (r.classList.contains('sc-q-foot') && !r.dataset.qteam))) cur.tail.push(r);
        else { cur = null; groups.push({ head: r, tail: [] }); }
      });
      const ordOf = gr => Number(gr.head.dataset.scOrd) || 0;
      const footOf = gr => gr.tail.find(r => r.dataset.elPts != null && r.dataset.pmode === mode) || null;
      const sorted = groups.slice().sort((a, b) => {
        if (!on) return ordOf(a) - ordOf(b);
        const pa = !!a.head.dataset.pid, pb = !!b.head.dataset.pid;
        if (!pa || !pb) return ordOf(a) - ordOf(b);                       // header / par rows stay where they are
        const fa = footOf(a), fb = footOf(b);
        if (!!fa !== !!fb) return fa ? -1 : 1;                             // players in the game first
        if (!fa) return ordOf(a) - ordOf(b);
        const ra = Number(fa.dataset.elRank) || 0, rb = Number(fb.dataset.elRank) || 0;
        if (!!ra !== !!rb) return ra ? -1 : 1;                             // finished cards first
        if (ra && ra !== rb) return ra - rb;
        if (!ra) { const k = (Number(fb.dataset.elKept) || 0) - (Number(fa.dataset.elKept) || 0); if (k) return k; }
        const p = (Number(fa.dataset.elPts) || 0) - (Number(fb.dataset.elPts) || 0); if (p) return p;
        return ordOf(a) - ordOf(b);
      });
      sorted.forEach(gr => { tb.appendChild(gr.head); gr.tail.forEach(r => tb.appendChild(r)); });
    });
  } catch (e) {}
}
function _bgScQuotaOrder(table, on) {'''
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))   # two markers + the two guide links
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('order fn', "function _bgScQuotaOrder(table, on) {", ORDER)
    one('order call', "    _bgScQuotaOrder(table, mode === 'quota');   // v2070", "    _bgScQuotaOrder(table, mode === 'quota');   // v2070\n    _bgScLowOrder(table, mode);   // v2082: 11's tabs, 1st to last")
    one('foot data', "f.className = 'sc-q-foot sc-p-foot'; f.dataset.pmode = pm.mode; f.style.display = 'none';",
        "f.className = 'sc-q-foot sc-p-foot'; f.dataset.pmode = pm.mode; f.style.display = 'none';\n      if (pm.low) { f.dataset.elPts = String(r.pts); f.dataset.elRank = String(r.rank || 0); f.dataset.elKept = String(r.kept || 0); }   // v2082: what the 11's tab sorts on")
    one('foot text', "  return (r.team ? escapeHtml(r.team) + ' · ' : '') + '<b class=\"sc-q-pts\">' + r.pts + '</b> ' + escapeHtml(T('strokes')) + ' · ' + r.kept + '/' + r.need + ' ' + escapeHtml(T('kept'))\n    + (r.rank ? ' · <span class=\"sc-mu sc-mu-' + (r.rank === 1 ? 'up' : 'as') + ' sc-q-diff\">' + escapeHtml(_bgPtPlace(r.rank, r.tied)) + '</span>' : '');",
        "  return (r.rank ? '<span class=\"sc-mu sc-mu-' + (r.rank === 1 ? 'up' : 'as') + ' sc-q-diff\">' + escapeHtml(_bgPtPlace(r.rank, r.tied)) + '</span> · ' : '')   // v2082: place in front, like the Quota line\n    + (r.team ? escapeHtml(r.team) + ' · ' : '') + '<b class=\"sc-q-pts\">' + r.pts + '</b> ' + escapeHtml(T('strokes')) + ' · ' + r.kept + '/' + r.need + ' ' + escapeHtml(T('kept'));")
    # event leaderboard keeps its place across a repaint
    one('evlb flag', "  let _evlbSeq = 0;", "  let _evlbSeq = 0;\n  let _evlbToTop = false;   // v2082: only a group-tab tap goes back to the top; a live refresh stays where you are")
    one('evlb tab tap', "      try { body.scrollTop = 0; } catch (e) {}", "      try { body.scrollTop = 0; } catch (e) {}\n      _evlbToTop = true;")
    one('evlb keep', "    body.innerHTML = _tabsHtml + (_evlbTab ? _grpHtml : (html || '<div class=\"help-text\">No scores in this event yet.</div>'));",
        "    /* v2082 (Tyler, 11/26): \"when I clicked the 11's tab on the scorecard, it kicked me back up.\" The board repaints\n       itself every 15 s, and the v1582 line below scrolled the active group pill into view -- vertically too, which\n       took the whole sheet back to the top. Remember where the reader is, repaint, centre the pill sideways only,\n       and put the sheet back. */\n    let _evlbKeep = null;\n    try { const _scr = [body.closest('.modal'), ov].filter(Boolean); _evlbKeep = _scr.map(el => ({ el: el, top: _evlbToTop ? 0 : el.scrollTop })); } catch (e) { _evlbKeep = null; }\n    _evlbToTop = false;\n    body.innerHTML = _tabsHtml + (_evlbTab ? _grpHtml : (html || '<div class=\"help-text\">No scores in this event yet.</div>'));")
    one('evlb pill', "if (_act && _act.scrollIntoView) _act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}   // v1582",
        "const _row = _act && _act.parentElement; if (_row && _row.scrollWidth > _row.clientWidth + 2) { const _ra = _act.getBoundingClientRect(), _rr = _row.getBoundingClientRect(); _row.scrollLeft += (_ra.left + _ra.width / 2) - (_rr.left + _rr.width / 2); } } catch (e) {}   // v1582; v2082: sideways only\n    try { (_evlbKeep || []).forEach(k => { if (k.el.scrollTop !== k.top) k.el.scrollTop = k.top; }); } catch (e) {}")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
