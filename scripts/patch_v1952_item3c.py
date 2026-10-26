#!/usr/bin/env python3
"""v1952 item 3c — one-tap par-relative score grid (Eagle … Quad + Other), stepper kept as a setting."""
import sys

EDITS = []

# ── CSS ──
EDITS.append((
"""  .score-stepper .val.empty { color: var(--bg-text-muted); font-weight: 400; }
""",
"""  .score-stepper .val.empty { color: var(--bg-text-muted); font-weight: 400; }
  /* v1952 (Hoon, 10/26): one-tap score grid. Eight cells, two rows of four on a phone. */
  .score-entry.score-entry--grid { grid-template-columns: 1fr; gap: 6px; }
  .score-entry--grid .score-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .score-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .score-grid .sg { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-height: 48px; padding: 5px 2px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-3); color: var(--bg-text); font-weight: 700; font-size: 17px; line-height: 1.05; }
  .score-grid .sg small { display: block; font-size: 9px; font-weight: 700; letter-spacing: .3px; color: var(--bg-text-muted); text-transform: uppercase; }
  .score-grid .sg.is-on { background: var(--bg-brand); border-color: var(--bg-brand); color: var(--bg-surface); }
  .score-grid .sg.is-on small { color: var(--bg-surface); opacity: .85; }
  .score-grid .sg.under { color: var(--success-text, #1f8a3b); }
  .score-grid .sg.over { color: var(--danger-text, #c0392b); }
  .score-grid .sg.is-on.under, .score-grid .sg.is-on.over { color: var(--bg-surface); }
  .score-grid .sg[disabled] { opacity: .35; }
  .score-grid .sg .pop-dot { position: absolute; top: 4px; right: 5px; }
  .score-entry--grid .score-stepper { justify-self: end; }
""",
"CSS"))

# ── Settings UI chips ──
EDITS.append((
"""          <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-top:10px">
            <span style="font-weight:500">📍 Share my location with spectators<br>""",
"""          <!-- v1952 (Hoon, via Tyler): one-tap score grid vs the −/+ stepper. Device pref bg_score_entry, synced. -->
          <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-top:10px">
            <div style="font-weight:500">🔢 Score entry<br><span class="small-text" style="color:var(--text-muted);font-weight:400"><strong>Grid</strong>: one tap — Eagle, Birdie, Par, Bogey, Double, Triple, Quad or Other. <strong>Stepper</strong>: the classic − / + buttons.</span></div>
            <div style="display:flex;gap:6px;margin-top:8px">
              <button type="button" class="bg-btn bg-btn--chip" id="pref-se-grid" data-se="grid" aria-pressed="false" style="flex:1 1 0">Grid</button>
              <button type="button" class="bg-btn bg-btn--chip" id="pref-se-stepper" data-se="stepper" aria-pressed="false" style="flex:1 1 0">Stepper</button>
            </div>
          </div>
          <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-top:10px">
            <span style="font-weight:500">📍 Share my location with spectators<br>""",
"settings chips"))

# ── pref helpers next to auto-advance ──
EDITS.append((
"""var _bgAA = { hole: null, until: 0, tick: null, stayHole: null, lastScoreHole: null };""",
"""// v1952 (Hoon): score entry style — 'grid' (one tap, par-relative) or 'stepper' (− / +). Device pref, synced.
const KEY_SCORE_ENTRY = 'bg_score_entry';
function bgScoreEntryMode() { try { return localStorage.getItem(KEY_SCORE_ENTRY) === 'stepper' ? 'stepper' : 'grid'; } catch (e) { return 'grid'; } }
function bgSetScoreEntryMode(m, quiet) {
  m = (m === 'stepper') ? 'stepper' : 'grid';
  try { localStorage.setItem(KEY_SCORE_ENTRY, m); } catch (e) {} try { bgPrefsNotePush(KEY_SCORE_ENTRY); } catch (e) {}
  bgPaintScoreEntryMode();
  try { if (state && state.game && typeof renderScoreEntry === 'function') renderScoreEntry(); } catch (e) {}
  if (!quiet) { try { showToast(m === 'grid' ? 'Score entry: one-tap grid' : 'Score entry: − / + stepper'); } catch (e) {} }
}
function bgPaintScoreEntryMode() {
  const m = bgScoreEntryMode();
  try { document.querySelectorAll('button[data-se]').forEach(b => { const on = b.dataset.se === m; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('is-on', on); b.textContent = (on ? '\\u2713 ' : '') + (b.dataset.se === 'grid' ? 'Grid' : 'Stepper'); }); } catch (e) {}
}
var _bgAA = { hole: null, until: 0, tick: null, stayHole: null, lastScoreHole: null };""",
"pref helpers"))

EDITS.append((
"""  'bg_colorblind'];   // v1928""",
"""  'bg_colorblind', 'bg_score_entry'];   // v1928 · v1952 score entry style""",
"sync prefs"))

# ── wire settings chips (next to the auto-advance wiring) ──
EDITS.append((
"""  try { document.querySelectorAll('button[data-aa]').forEach(b => { b.onclick = () => bgSetAutoAdvanceMode(b.dataset.aa); }); } catch (e) {}""",
"""  try { document.querySelectorAll('button[data-aa]').forEach(b => { b.onclick = () => bgSetAutoAdvanceMode(b.dataset.aa); }); } catch (e) {}
  try { document.querySelectorAll('button[data-se]').forEach(b => { b.onclick = () => bgSetScoreEntryMode(b.dataset.se); }); bgPaintScoreEntryMode(); } catch (e) {}   // v1952""",
"wire chips"))

# ── render: grid rows ──
EDITS.append((
"""      row.innerHTML = `
        <div>
          <div class="name">${displayFirst(p)}${guestPillHtml(p.name, p)}${testPillHtml(p.name)}${_csBadge}</div>
          <div class="meta">${p.playsGross ? 'Plays gross' : `HCP ${p.hcp}${bgHcpWhy(g, p)}${strokes > 0 ? ` · gets ${strokes} stroke${strokes > 1 ? 's' : ''}` : ''}`}${_leaveLnk}</div>
        </div>
        ${_outNow ? `<div class="score-stepper" style="position:relative;opacity:.55"><div class="val empty" id="val-${p.id}" title="Left after hole ${_leftN}">out</div></div>` : `<div class="score-stepper" style="position:relative${_cs ? ';opacity:.45' : ''}">
          ${strokes > 0 ? `<span class="pop-dot${strokes > 1 ? ' pop-multi' : ''}" title="${strokes} stroke${strokes > 1 ? 's' : ''} on this hole"></span>` : ''}
          <button class="bg-btn bg-btn--seg" data-action="dec" data-pid="${p.id}">−</button>
          <div class="val ${score === null ? 'empty' : ''}" id="val-${p.id}">${score === null ? '—' : score}</div>
          <button class="bg-btn bg-btn--seg" data-action="inc" data-pid="${p.id}">+</button>
        </div>`}
      `;
      container.appendChild(row);""",
"""      const _headHtml = `<div>
          <div class="name">${displayFirst(p)}${guestPillHtml(p.name, p)}${testPillHtml(p.name)}${_csBadge}</div>
          <div class="meta">${p.playsGross ? 'Plays gross' : `HCP ${p.hcp}${bgHcpWhy(g, p)}${strokes > 0 ? ` · gets ${strokes} stroke${strokes > 1 ? 's' : ''}` : ''}`}${_leaveLnk}</div>
        </div>`;
      const _stepHtml = _outNow ? `<div class="score-stepper" style="position:relative;opacity:.55"><div class="val empty" id="val-${p.id}" title="Left after hole ${_leftN}">out</div></div>` : `<div class="score-stepper" style="position:relative${_cs ? ';opacity:.45' : ''}">
          ${strokes > 0 ? `<span class="pop-dot${strokes > 1 ? ' pop-multi' : ''}" title="${strokes} stroke${strokes > 1 ? 's' : ''} on this hole"></span>` : ''}
          <button class="bg-btn bg-btn--seg" data-action="dec" data-pid="${p.id}">−</button>
          <div class="val ${score === null ? 'empty' : ''}" id="val-${p.id}">${score === null ? '—' : score}</div>
          <button class="bg-btn bg-btn--seg" data-action="inc" data-pid="${p.id}">+</button>
        </div>`;
      /* v1952 (Hoon, 10/26): "it's a bit of a pain to have to tap the + button 3-5 times
         for a double par." One-tap grid, par-relative for THIS player's tee: Eagle…Quad
         plus Other (which shows the stepper for anything outside that range). The
         tournament max-score cap greys out the cells above it. Setting: bg_score_entry. */
      const _par = Number(parFor(g, p.id, h - 1)) || Number((g.pars || [])[h - 1]) || 4;
      const _gridOn = !_outNow && bgScoreEntryMode() === 'grid';
      const _otherKey = h + ':' + p.id;
      const _inRange = score === null || (score >= _par - 2 && score <= _par + 4);
      const _showStepper = !_gridOn || (state._scoreOther && state._scoreOther[_otherKey]) || !_inRange;
      if (_gridOn && !_showStepper) {
        let _cap = null; try { _cap = bgMaxScoreFor(g, p.id, h - 1); } catch (e) { _cap = null; }
        const cells = [[-2, 'Eagle'], [-1, 'Birdie'], [0, 'Par'], [1, 'Bogey'], [2, 'Double'], [3, 'Triple'], [4, 'Quad']];
        let gh = '';
        cells.forEach(c => {
          const n = _par + c[0];
          if (n < 1) { gh += `<button type="button" class="sg" disabled><span>·</span><small>${c[1]}</small></button>`; return; }
          const on = score === n;
          const over = _cap != null && n > _cap;
          gh += `<button type="button" class="sg${on ? ' is-on' : ''}${c[0] < 0 ? ' under' : (c[0] > 1 ? ' over' : '')}" data-set="${n}" data-pid="${p.id}"${over ? ' disabled title="Above the max score"' : ''}><span>${n}</span><small>${c[1]}</small></button>`;
        });
        gh += `<button type="button" class="sg" data-other="${p.id}"><span>…</span><small>Other</small></button>`;
        row.classList.add('score-entry--grid');
        row.innerHTML = `<div class="score-head">${_headHtml}<div class="score-stepper" style="position:relative${_cs ? ';opacity:.45' : ''}">${strokes > 0 ? `<span class="pop-dot${strokes > 1 ? ' pop-multi' : ''}" title="${strokes} stroke${strokes > 1 ? 's' : ''} on this hole"></span>` : ''}<div class="val ${score === null ? 'empty' : ''}" id="val-${p.id}">${score === null ? '—' : score}</div></div></div>
          <div class="score-grid"${_cs ? ' style="opacity:.45"' : ''}>${gh}</div>`;
      } else {
        row.innerHTML = `
        ${_headHtml}
        ${_stepHtml}
      `;
        if (_gridOn && !_outNow) {   // Other / out-of-range: the stepper, with a way back to the grid
          try { const _m = row.querySelector('.meta'); if (_m) _m.insertAdjacentHTML('beforeend', ` · <span role="button" tabindex="0" class="bg-leave-lnk" data-grid-back="${p.id}">grid</span>`); } catch (e) {}
        }
      }
      container.appendChild(row);""",
"render rows"))

EDITS.append((
"""    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = () => handleScoreChange(btn.dataset.pid, btn.dataset.action);
    });""",
"""    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = () => handleScoreChange(btn.dataset.pid, btn.dataset.action);
    });
    // v1952: one-tap grid cells; Other swaps that row to the stepper (per hole, per player).
    container.querySelectorAll('.score-grid button[data-set]').forEach(btn => {
      btn.onclick = () => {
        const n = Number(btn.dataset.set), pid = btn.dataset.pid;
        try { const cur = state.game && state.game.scores[pid] && state.game.scores[pid][h - 1]; if (cur === n) { clearScoreFor(pid); return; } } catch (e) {}
        handleScoreChange(pid, 'set:' + n);
        try { btn.closest('.score-grid').querySelectorAll('.sg').forEach(b => b.classList.toggle('is-on', b === btn)); } catch (e) {}
      };
    });
    container.querySelectorAll('.score-grid button[data-other]').forEach(btn => {
      btn.onclick = () => { if (!state._scoreOther) state._scoreOther = {}; state._scoreOther[h + ':' + btn.dataset.other] = true; renderScoreEntry(); };
    });
    container.querySelectorAll('[data-grid-back]').forEach(el => {
      el.onclick = () => { try { delete state._scoreOther[h + ':' + el.dataset.gridBack]; } catch (e) {} renderScoreEntry(); };
    });""",
"wire grid"))

# ── setter: 'set:N' action ──
EDITS.append((
"""  if (action === 'inc') {
    if (cur === null) cur = g.pars[h - 1];
    else cur = Math.min(15, cur + 1);
  } else {
    if (cur === null) cur = g.pars[h - 1] - 1;
    else if (cur <= 1) cur = null;
    else cur = cur - 1;
  }
""",
"""  if (typeof action === 'string' && action.indexOf('set:') === 0) {   // v1952: one-tap grid
    const n = Math.round(Number(action.slice(4)));
    cur = (isFinite(n) && n >= 1) ? Math.min(15, n) : null;
  } else if (action === 'inc') {
    if (cur === null) cur = g.pars[h - 1];
    else cur = Math.min(15, cur + 1);
  } else {
    if (cur === null) cur = g.pars[h - 1] - 1;
    else if (cur <= 1) cur = null;
    else cur = cur - 1;
  }
""",
"setter"))


def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: {len(EDITS)} edits applied')

for p in sys.argv[1:]:
    patch(p)
