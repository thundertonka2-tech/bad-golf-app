#!/usr/bin/env python3
"""v2070 (Tyler, 11/25: "The way we have it it's hard to tell on the quota tab who is winning ... When showing the
quota tab sort it by 1st to last place."): the Quota tab orders the player rows by result (points minus quota,
then points), players not in the quota at the bottom, and prints the place in front of each line --
"T1st · 27 pts · quota 24 · +3". Places are shown on the whole-field card and on a casual round's card; an
event cart's card only sorts (its rows are a slice of the pool, so a place there would mislead). Every other tab
keeps the card's own order.

    python scripts/patch_v2070_quota_tab_sorted_places.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2069', 'v2026.11.2070'

EDITS = [
  ('foot-build',
   """      if (qModel && !table.querySelector('tr.sc-q-foot:not(.sc-p-foot)')) {
        const nCols = cols.length;
        table.querySelectorAll('tbody tr[data-pid]').forEach(tr => {
          if (tr.dataset.scExtra || (tr.closest('tbody') && tr.closest('tbody').classList.contains('sc-units-band'))) return;
          const q = qModel.rows[tr.dataset.pid]; if (!q) return;
          const f = document.createElement('tr');
          f.className = 'sc-q-foot'; f.dataset.qpid = tr.dataset.pid;
          f.innerHTML = '<td colspan="' + nCols + '"><span class="sc-q-line">' + _bgQFootHtml(q, null) + '</span></td>';
          tr.parentNode.insertBefore(f, tr.nextSibling);
        });""",
   """      if (qModel && !table.querySelector('tr.sc-q-foot:not(.sc-p-foot)')) {
        const nCols = cols.length;
        /* v2070 (Tyler): places. Ranked over the rows this card holds -- the whole-field card and a casual round
           hold the whole pool; an event cart's card holds a slice of it, so no place is printed there (it still sorts). */
        const _qRows = Array.from(table.querySelectorAll('tbody tr[data-pid]')).filter(tr => !tr.dataset.scExtra && !(tr.closest('tbody') && tr.closest('tbody').classList.contains('sc-units-band')) && qModel.rows[tr.dataset.pid]);
        const _qIsEvent = !!(g && g.t2 && g.t2.tournamentId);
        const _qPlaces = (!_qIsEvent || (g && g._bgQuotaField)) ? true : false;
        _qRows.forEach(tr => {
          const q = qModel.rows[tr.dataset.pid];
          let above = 0, same = 0;
          _qRows.forEach(o => { const x = qModel.rows[o.dataset.pid]; const dx = Number(x.diff) || 0, dq = Number(q.diff) || 0; if (dx > dq) above++; else if (dx === dq) same++; });   // places by result alone (the pool's own tie rule); points only order the display
          tr.dataset.qdiff = String(Number(q.diff) || 0); tr.dataset.qpts = String(Number(q.pts) || 0); tr.dataset.qrank = String(above + 1);
          const f = document.createElement('tr');
          f.className = 'sc-q-foot'; f.dataset.qpid = tr.dataset.pid;
          const place = _qPlaces ? ('<b class="sc-q-place">' + escapeHtml((same > 1 ? 'T' : '') + _bgPtPlace(above + 1, false)) + '</b> · ') : '';
          f.innerHTML = '<td colspan="' + nCols + '"><span class="sc-q-line">' + place + _bgQFootHtml(q, null) + '</span></td>';
          tr.parentNode.insertBefore(f, tr.nextSibling);
        });"""),
  ('apply-sort',
   """    table.querySelectorAll('.sc-tab').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  } catch (e) {}
}
function bgScTab(ev, btn) {""",
   """    table.querySelectorAll('.sc-tab').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    _bgScQuotaOrder(table, mode === 'quota');   // v2070: 1st to last on the Quota tab, the card's own order elsewhere
  } catch (e) {}
}
/* v2070 (Tyler, 11/25): "sort it by 1st to last place." On the Quota tab the player rows (each followed by its
   quota line) are ordered by result -- points minus quota, then points -- with players not in the quota at the
   bottom; every other tab puts the card back in its own order. The original order is remembered on each row the
   first time this runs (data-sc-ord), so the two orders can be swapped any number of times. */
function _bgScQuotaOrder(table, on) {
  try {
    const bodies = Array.from(table.querySelectorAll('tbody')).filter(b => !b.classList.contains('sc-units-band'));
    bodies.forEach(tb => {
      const rows = Array.from(tb.children).filter(r => r.tagName === 'TR');
      if (!rows.length) return;
      if (!rows.some(r => r.dataset.qpid)) return;   // no quota lines in this body: nothing to order
      rows.forEach((r, i) => { if (r.dataset.scOrd == null) r.dataset.scOrd = String(i); });
      // groups: a player row carries its quota line (and its Match-view extra rows) with it
      const groups = []; let cur = null;
      rows.forEach(r => {
        if (r.dataset.pid && !r.dataset.scExtra) { cur = { head: r, tail: [] }; groups.push(cur); }
        else if (cur && (r.dataset.scExtra || (r.classList.contains('sc-q-foot') && !r.dataset.qteam))) cur.tail.push(r);   // his quota line, his points lines, his Match-view rows
        else { cur = null; groups.push({ head: r, tail: [] }); }
      });
      const ordOf = gr => Number(gr.head.dataset.scOrd) || 0;
      const sorted = groups.slice().sort((a, b) => {
        if (!on) return ordOf(a) - ordOf(b);
        const qa = a.head.dataset.qdiff != null, qb = b.head.dataset.qdiff != null;
        if (qa !== qb) return qa ? -1 : 1;                              // quota players first
        if (!qa) return ordOf(a) - ordOf(b);
        const d = (Number(b.head.dataset.qdiff) || 0) - (Number(a.head.dataset.qdiff) || 0); if (d) return d;
        const p = (Number(b.head.dataset.qpts) || 0) - (Number(a.head.dataset.qpts) || 0); if (p) return p;
        return ordOf(a) - ordOf(b);
      });
      sorted.forEach(gr => { tb.appendChild(gr.head); gr.tail.forEach(r => tb.appendChild(r)); });
    });
  } catch (e) {}
}
function bgScTab(ev, btn) {"""),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('build', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]


def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (os.path.basename(path), name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')


if __name__ == '__main__':
    for f in FILES:
        patch(f)
