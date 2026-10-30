import sys
OLD_VER, NEW_VER = 'v2026.11.1977', 'v2026.11.1978'
edits = []

# ---------------- CSS ----------------
edits.append((
"""  /* v1566: Match / Strokes tabs + match-status cells on every scorecard */""",
"""  /* v1978 (Tyler, 10/30): Round Rating - 1-5 stars per player per course. The chip is one glyph,
     the average and the count, so it fits beside a course name on a 320px row. */
  .bg-rr-chip { display:inline-flex; align-items:center; gap:3px; flex:0 0 auto; font-size:12px; font-weight:700; color:var(--gold,#d4af37); white-space:nowrap; cursor:pointer; padding:2px 6px; border-radius:99px; background:rgba(212,175,55,0.12); line-height:1.2; }
  .bg-rr-chip small { font-weight:600; color:var(--bg-text-muted,var(--text-muted)); font-size:11px; }
  .bg-rr-chip:empty { display:none; }
  .bg-rr-stars { display:flex; justify-content:center; gap:6px; margin:10px 0 6px; }
  .bg-rr-stars button { width:48px; height:48px; font-size:30px; line-height:1; background:none; border:none; padding:0; color:var(--border); cursor:pointer; -webkit-tap-highlight-color:transparent; }
  .bg-rr-stars button.on { color:var(--gold,#d4af37); }
  .bg-rr-note { width:100%; box-sizing:border-box; font-size:16px; padding:10px; border:1px solid var(--border); border-radius:10px; background:var(--bg-surface); color:var(--bg-text); resize:none; }
  .bg-rr-hist { display:grid; grid-template-columns:auto 1fr auto; gap:4px 8px; align-items:center; font-size:12px; margin:8px 0 12px; }
  .bg-rr-hist .bar { height:8px; border-radius:4px; background:var(--border); overflow:hidden; }
  .bg-rr-hist .bar i { display:block; height:100%; background:var(--gold,#d4af37); }
  #bg-rr-never { font-size:12px; color:var(--text-muted); }
  .bg-rr-row { padding:8px 0; border-top:1px solid var(--border); font-size:13px; }
  .bg-rr-row .who { display:flex; justify-content:space-between; gap:8px; }
  .bg-rr-row .note { color:var(--bg-text-muted,var(--text-muted)); margin-top:2px; white-space:pre-wrap; overflow-wrap:anywhere; }
  /* v1566: Match / Strokes tabs + match-status cells on every scorecard */""",
"css"))

# ---------------- Preview modal: rating line under the city ----------------
edits.append((
"""        '<p class="help-text" id="cp-modal-city" style="margin:0 0 10px"></p>' +
        '<div id="cp-modal-meta" class="cp-meta"></div>' +""",
"""        '<p class="help-text" id="cp-modal-city" style="margin:0 0 10px"></p>' +
        '<div id="cp-modal-rr" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 10px"></div>' +   /* v1978: Round Rating */
        '<div id="cp-modal-meta" class="cp-meta"></div>' +""",
"preview markup"))

edits.append((
"""      m.querySelector('#cp-modal-city').textContent = (lib.city || '');
      try { window.renderCoursePreviewContact(_fsP ? _fsP.base : (_csP ? _csP.base : courseId), lib); } catch (e) {}""",
"""      m.querySelector('#cp-modal-city').textContent = (lib.city || '');
      try { if (typeof window.bgRRPreviewPaint === 'function') window.bgRRPreviewPaint(_fsP ? _fsP.base : (_csP ? _csP.base : courseId), lib); } catch (e) {}   // v1978: Round Rating
      try { window.renderCoursePreviewContact(_fsP ? _fsP.base : (_csP ? _csP.base : courseId), lib); } catch (e) {}""",
"preview paint call"))

# ---------------- Post-finish chain: Round Rating ask comes first ----------------
edits.append((
"""        _bgGrowthBusy = true;
        try {
          const shown = await bgMaybeAskRating(g);
          if (!shown) await bgMaybeNudgeInvite();""",
"""        _bgGrowthBusy = true;
        try {
          // v1978 (Tyler): the Round Rating ask for the course just played comes first; the
          // App Store ask and the invite nudge only run when it was not shown (one prompt max).
          let shown = false;
          try { if (typeof bgRRMaybeAsk === 'function') shown = await bgRRMaybeAsk(g); } catch (e) { shown = false; }
          if (!shown) shown = await bgMaybeAskRating(g);
          if (!shown) await bgMaybeNudgeInvite();""",
"post-finish chain"))

# ---------------- Home rows: ask the other players once their round shows as finished ----------------
edits.append((
"""  _bgPaintHomeRows(rows);
  try { state._homeRowsFreshOnce = true; _bgHomeSnapSave('rows', rows.slice(0, 14)); } catch (e) {}   // v1733""",
"""  _bgPaintHomeRows(rows);
  try { state._homeRowsFreshOnce = true; _bgHomeSnapSave('rows', rows.slice(0, 14)); } catch (e) {}   // v1733
  try { if (typeof bgRRMaybeAskRecent === 'function') bgRRMaybeAskRecent(rows); } catch (e) {}   // v1978: Round Rating for players who did not keep score""",
"home rows ask"))

# ---------------- Engine ----------------
edits.append((
"""function bgPostFinishGrowth(g) {
  try {
    const code = (g && g.code) || '';""",
"""/* ============================================================
   v1978 (Tyler, 10/30): ROUND RATING - 1-5 stars per player per course.
   NOT the USGA course rating (that stays "rating/slope" everywhere).
   - round_ratings: one row per (course_id, user_id); re-rating overwrites.
   - Shown as a chip "★ 4.3 (12)" beside the course in every course picker and on the
     course preview; the average shows only once 3 people have rated, the count always.
   - Tap the chip -> breakdown (5..1 histogram) and every rating with its note.
   - Asked once per player per round after a round finishes: Skip asks again next round
     there; "Don't ask again" silences that course on this phone.
   Everything is additive and guarded; a failed read just paints no chip.
   ============================================================ */
(function () {
  const TTL = 10 * 60 * 1000;
  const _sum = new Map();          // courseId -> { at, avg, n, h: [h5,h4,h3,h2,h1] }
  let _want = new Set(), _flushT = null, _obsT = null;
  const esc = s => (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
  const signedIn = () => { try { return typeof isSignedIn === 'function' && isSignedIn(); } catch (e) { return false; } };
  // The id players rate: a nine-combo of a 27-hole course rates the course itself.
  function baseId(id) {
    try {
      id = String(id || '').trim(); if (!id || id === '__none__') return '';
      const cs = (typeof comboSpecFromId === 'function') ? comboSpecFromId(id) : null;
      return (cs && cs.base) ? String(cs.base) : id;
    } catch (e) { return String(id || ''); }
  }
  function libName(id) { try { const c = (COURSE_LIBRARY || []).find(x => x && x.id === id); return c ? (c.name || '') : ''; } catch (e) { return ''; } }
  function idByName(name) {
    try {
      const n = String(name || '').trim().toLowerCase(); if (!n) return '';
      const c = (COURSE_LIBRARY || []).find(x => x && String(x.name || '').trim().toLowerCase() === n);
      return c ? c.id : '';
    } catch (e) { return ''; }
  }
  function chipText(s) {
    if (!s || !s.n) return '';
    return (s.avg != null ? ('\\u2605 ' + Number(s.avg).toFixed(1)) : '\\u2605') + ' <small>(' + s.n + ')</small>';
  }
  async function fetchSummary(ids) {
    const need = ids.filter(id => { const c = _sum.get(id); return !(c && (Date.now() - c.at) < TTL); });
    if (need.length && typeof supa !== 'undefined' && supa) {
      try {
        const r = await supa.rpc('bg_round_rating_summary', { p_ids: need });
        const seen = {};
        if (!r.error && Array.isArray(r.data)) r.data.forEach(row => { if (row && row.course_id) { seen[row.course_id] = 1; _sum.set(row.course_id, { at: Date.now(), avg: row.avg, n: Number(row.n) || 0, h: [row.h5, row.h4, row.h3, row.h2, row.h1].map(Number) }); } });
        if (!r.error) need.forEach(id => { if (!seen[id]) _sum.set(id, { at: Date.now(), avg: null, n: 0, h: [0, 0, 0, 0, 0] }); });
      } catch (e) {}
    }
    const out = {}; ids.forEach(id => { const c = _sum.get(id); if (c) out[id] = c; }); return out;
  }
  function invalidate(id) { try { _sum.delete(id); } catch (e) {} }
  // Paint every chip on screen for these ids (after a save, or when the fetch lands).
  function paintChips(map) {
    try {
      document.querySelectorAll('.bg-rr-chip[data-rr]').forEach(el => {
        const id = el.getAttribute('data-rr'); const s = map[id]; if (!s) return;
        el.innerHTML = chipText(s);
      });
    } catch (e) {}
  }
  function scheduleFetch() {
    if (_flushT) return;
    _flushT = setTimeout(async () => {
      _flushT = null;
      const ids = Array.from(_want); _want = new Set();
      if (!ids.length) return;
      const map = await fetchSummary(ids);
      paintChips(map);
    }, 80);
  }
  // Decorate course rows: a chip placeholder beside the name, filled when the summary lands.
  function decorate(root) {
    try {
      if (!signedIn()) return;
      const rows = (root || document).querySelectorAll('.course-list-row:not([data-rr-done])');
      if (!rows.length) return;
      rows.forEach(row => {
        row.setAttribute('data-rr-done', '1');
        if (row.hasAttribute('data-keepcur')) return;
        let id = row.getAttribute('data-course-id') || row.getAttribute('data-cid') || '';
        if (!id && row.getAttribute('data-name')) id = idByName(row.getAttribute('data-name'));
        id = baseId(id); if (!id) return;
        const chip = document.createElement('span');
        chip.className = 'bg-rr-chip'; chip.setAttribute('data-rr', id);
        const c = _sum.get(id); if (c) chip.innerHTML = chipText(c); else _want.add(id);
        chip.addEventListener('click', ev => { try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {} window.bgRRDetailSheet(id); });
        const main = row.querySelector('.row-main');
        const nm = row.querySelector('.row-name');
        if (main && main.parentNode === row) main.insertAdjacentElement('afterend', chip);
        else if (nm) { if (nm.parentNode === row) nm.insertAdjacentElement('afterend', chip); else nm.parentNode.insertAdjacentElement('afterend', chip); }
        else row.appendChild(chip);
      });
      scheduleFetch();
    } catch (e) {}
  }
  window.bgRRDecorate = decorate;
  // Pickers are painted by a dozen different builders; one observer covers them all.
  try {
    const mo = new MutationObserver(() => { if (_obsT) return; _obsT = setTimeout(() => { _obsT = null; decorate(document); }, 120); });
    const start = () => { try { mo.observe(document.body, { childList: true, subtree: true }); decorate(document); } catch (e) {} };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  } catch (e) {}

  // ---- preview modal line: chip (or "No ratings yet") + Rate button ----
  window.bgRRPreviewPaint = async function (courseId, lib) {
    const box = document.getElementById('cp-modal-rr'); if (!box) return;
    const id = baseId(courseId);
    if (!id || !signedIn()) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="bg-rr-chip" data-rr="' + esc(id) + '"></span><span class="help-text bg-rr-none" style="margin:0;display:none">No ratings yet</span>'
      + '<button type="button" class="bg-btn bg-btn--chip" id="cp-rr-rate">\\u2605 Rate this course</button>';
    const chip = box.querySelector('.bg-rr-chip');
    chip.onclick = () => window.bgRRDetailSheet(id);
    box.querySelector('#cp-rr-rate').onclick = () => window.bgRRRateSheet(id, { name: (lib && lib.name) || libName(id) }).then(() => window.bgRRPreviewPaint(courseId, lib));
    const map = await fetchSummary([id]); const s = map[id];
    if (!document.body.contains(box)) return;
    if (s && s.n) chip.innerHTML = chipText(s); else { chip.innerHTML = ''; const none = box.querySelector('.bg-rr-none'); if (none) none.style.display = ''; }
  };

  // ---- my own row for a course ----
  async function mine(id) {
    try {
      const uid = (_authUser && _authUser.id) || (window._authUser && window._authUser.id);
      if (!signedIn() || typeof supa === 'undefined' || !supa || !uid) return null;
      const r = await supa.from('round_ratings').select('stars,note').eq('course_id', id).eq('user_id', uid).maybeSingle();
      return (r && !r.error && r.data) ? r.data : null;
    } catch (e) { return null; }
  }

  // ---- the rating sheet (also the end-of-round ask) ----
  // opts: { name, gameCode, ask:true -> shows Skip + "Don't ask again" }
  window.bgRRRateSheet = function (courseId, opts) {
    opts = opts || {};
    const id = baseId(courseId);
    return new Promise(async resolve => {
      let ov = null, done = false;
      const finish = v => { if (done) return; done = true; try { if (ov) ov.remove(); } catch (e) {} resolve(v); };
      try {
        if (!id || !signedIn()) return finish(false);
        const name = opts.name || libName(id) || 'this course';
        const prev = await mine(id);
        let stars = prev ? Number(prev.stars) || 0 : 0;
        ov = document.createElement('div');
        ov.className = 'modal-overlay show'; ov.id = 'bg-rr-sheet'; ov.style.zIndex = '100099';
        ov.innerHTML = '<div class="modal" style="max-width:400px;text-align:center">'
          + '<h2 style="margin:0 0 4px">Round Rating</h2>'
          + '<p class="help-text" style="margin:0 0 4px;line-height:1.4">' + (prev ? 'Update your rating of ' : 'How was ') + '<b>' + esc(name) + '</b>' + (prev ? '?' : ' today?') + '</p>'
          + '<div class="bg-rr-stars" role="radiogroup" aria-label="Stars">' + [1, 2, 3, 4, 5].map(n => '<button type="button" data-n="' + n + '" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">\\u2605</button>').join('') + '</div>'
          + '<div class="small-text bg-rr-lbl" style="min-height:16px;color:var(--text-muted);margin-bottom:8px"></div>'
          + '<textarea class="bg-rr-note" rows="2" maxlength="280" placeholder="Anything worth knowing? Conditions, pace, greens\\u2026 (optional)">' + esc(prev && prev.note ? prev.note : '') + '</textarea>'
          + '<button type="button" class="bg-btn bg-btn--primary bg-btn--full primary full" id="bg-rr-save" style="margin-top:12px" disabled>Save rating</button>'
          + '<button type="button" class="bg-btn bg-btn--ghost bg-btn--full full" id="bg-rr-skip" style="margin-top:8px">' + (opts.ask ? 'Skip' : 'Cancel') + '</button>'
          + (opts.ask ? '<button type="button" class="bg-btn bg-btn--ghost bg-btn--full full small" id="bg-rr-never" style="margin-top:4px">Don\\u2019t ask again for this course</button>' : '')
          + '</div>';
        document.body.appendChild(ov);
        try { if (typeof bgKeyboardSafe === 'function') bgKeyboardSafe(ov); } catch (e) {}
        const LBL = ['', 'Rough day', 'Meh', 'Decent', 'Good track', 'Loved it'];
        const btns = Array.from(ov.querySelectorAll('.bg-rr-stars button'));
        const save = ov.querySelector('#bg-rr-save'), lbl = ov.querySelector('.bg-rr-lbl');
        const paint = () => { btns.forEach(b => b.classList.toggle('on', Number(b.dataset.n) <= stars)); save.disabled = !stars; lbl.textContent = LBL[stars] || ''; };
        btns.forEach(b => b.onclick = () => { stars = Number(b.dataset.n); paint(); });
        paint();
        ov.querySelector('#bg-rr-skip').onclick = () => finish(false);
        const nv = ov.querySelector('#bg-rr-never');
        if (nv) nv.onclick = () => { try { localStorage.setItem('golf:rr-skip:' + id, '1'); } catch (e) {} try { showToast('Okay \\u2014 we won\\u2019t ask about this course again'); } catch (e) {} finish(false); };
        save.onclick = async () => {
          if (!stars) return;
          save.disabled = true; save.textContent = 'Saving\\u2026';
          const note = (ov.querySelector('.bg-rr-note').value || '').trim().slice(0, 280);
          let ok = false;
          try {
            const r = await supa.from('round_ratings').upsert({ course_id: id, user_id: (_authUser && _authUser.id) || (window._authUser && window._authUser.id), stars: stars, note: note || null, game_code: opts.gameCode || null, updated_at: new Date().toISOString() }, { onConflict: 'course_id,user_id' });
            ok = !(r && r.error);
          } catch (e) { ok = false; }
          if (!ok) { save.disabled = false; save.textContent = 'Save rating'; try { showToast('Couldn\\u2019t save \\u2014 check your connection'); } catch (e) {} return; }
          invalidate(id);
          try { showToast('Thanks \\u2014 rating saved \\u2605'); } catch (e) {}
          try { const map = await fetchSummary([id]); paintChips(map); } catch (e) {}
          finish(true);
        };
        ov.onclick = e => { if (e.target === ov && !opts.ask) finish(false); };
      } catch (e) { finish(false); }
    });
  };

  // ---- breakdown + notes ----
  window.bgRRDetailSheet = async function (courseId) {
    const id = baseId(courseId); if (!id) return;
    const name = libName(id) || 'Course';
    const ov = document.createElement('div');
    ov.className = 'modal-overlay show'; ov.style.zIndex = '100098';
    ov.innerHTML = '<div class="modal" style="max-width:440px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="min-width:0"><h2 style="margin:0">Round Rating</h2><div class="help-text" style="margin:2px 0 0">' + esc(name) + '</div></div>'
      + '<button type="button" class="bg-btn bg-btn--ghost bg-btn--icon" id="bg-rrd-x" aria-label="Close">\\u2715</button></div>'
      + '<div id="bg-rrd-body" style="margin-top:10px"><div class="bg-inline-load"><span class="sp"></span>Loading\\u2026</div></div>'
      + (signedIn() ? '<button type="button" class="bg-btn bg-btn--primary bg-btn--full primary full" id="bg-rrd-rate" style="margin-top:12px">\\u2605 Rate this course</button>' : '')
      + '<button type="button" class="bg-btn bg-btn--ghost bg-btn--full full" id="bg-rrd-close" style="margin-top:8px">Close</button></div>';
    document.body.appendChild(ov);
    const close = () => { try { ov.remove(); } catch (e) {} };
    ov.querySelector('#bg-rrd-x').onclick = close; ov.querySelector('#bg-rrd-close').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
    const rb = ov.querySelector('#bg-rrd-rate');
    if (rb) rb.onclick = () => { window.bgRRRateSheet(id, { name: name }).then(v => { if (v) { close(); window.bgRRDetailSheet(id); } }); };
    const body = ov.querySelector('#bg-rrd-body');
    try {
      invalidate(id);
      const map = await fetchSummary([id]); const s = map[id] || { n: 0, avg: null, h: [0, 0, 0, 0, 0] };
      let rows = [];
      try { const r = await supa.rpc('bg_round_rating_detail', { p_id: id }); if (!r.error && Array.isArray(r.data)) rows = r.data; } catch (e) {}
      if (!document.body.contains(ov)) return;
      if (!s.n) { body.innerHTML = '<p class="help-text" style="text-align:center;padding:10px 0">No ratings yet \\u2014 be the first.</p>'; return; }
      let h = '<div style="text-align:center;font-size:26px;font-weight:800;color:var(--gold,#d4af37)">\\u2605 ' + (s.avg != null ? Number(s.avg).toFixed(1) : '\\u2014') + '</div>'
        + '<div class="help-text" style="text-align:center;margin:0 0 6px">' + s.n + ' rating' + (s.n === 1 ? '' : 's') + (s.avg == null ? ' \\u00b7 average shows after 3' : '') + '</div>';
      const mx = Math.max(1, ...s.h);
      h += '<div class="bg-rr-hist">' + [5, 4, 3, 2, 1].map((n, i) => '<span>' + n + ' \\u2605</span><span class="bar"><i style="width:' + Math.round(100 * (s.h[i] || 0) / mx) + '%"></i></span><span>' + (s.h[i] || 0) + '</span>').join('') + '</div>';
      h += rows.map(r => {
        const d = r.updated_at ? new Date(r.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        return '<div class="bg-rr-row"><div class="who"><span><b>' + esc(r.name || 'A golfer') + '</b> <span style="color:var(--gold,#d4af37)">' + '\\u2605'.repeat(Math.max(0, Math.min(5, Number(r.stars) || 0))) + '</span></span><span class="help-text" style="margin:0">' + esc(d) + '</span></div>'
          + (r.note ? '<div class="note">' + esc(r.note) + '</div>' : '') + '</div>';
      }).join('');
      body.innerHTML = h;
    } catch (e) { try { body.innerHTML = '<p class="help-text" style="text-align:center">Couldn\\u2019t load the ratings.</p>'; } catch (e2) {} }
  };

  // ---- the ask after a round ----
  const askedKey = code => 'golf:rr-asked:' + code;
  function canAsk(id, code) {
    try {
      if (!id || !code || !signedIn()) return false;
      if (localStorage.getItem(askedKey(code))) return false;
      if (localStorage.getItem('golf:rr-skip:' + id)) return false;
      return true;
    } catch (e) { return false; }
  }
  // The scorekeeper, right after Finish (runs inside the post-finish growth chain).
  window.bgRRMaybeAsk = async function (g) {
    try {
      if (!g || !g.code || /^(PREVIEW|MAP|GRN|FWC)-/.test(String(g.code))) return false;
      if (g._mapOnly || g._preview) return false;
      if (typeof bgIsSimRound === 'function' && bgIsSimRound({ gameCode: g.code })) return false;
      const id = baseId(g.courseId); if (!canAsk(id, g.code)) return false;
      try { localStorage.setItem(askedKey(g.code), '1'); } catch (e) {}   // stamp BEFORE showing - never re-ask after a crash
      await window.bgRRRateSheet(id, { name: g.course, gameCode: g.code, ask: true });
      return true;
    } catch (e) { return false; }
  };
  // Everyone else: once their finished round (last 36h) shows on Home, ask once. Same
  // quiet rules as the growth prompts - never over a live round or another sheet.
  let _recentBusy = false;
  window.bgRRMaybeAskRecent = function (rows) {
    try {
      if (_recentBusy || !signedIn()) return;
      const cut = Date.now() - 36 * 3600 * 1000;
      const r = (rows || []).find(x => x && x.kind === 'completed' && x.gameCode && x.courseId && !x.manual && !x.imported && !x.sim
        && x.date && (Date.parse(x.date) || 0) >= cut - 24 * 3600 * 1000 && canAsk(baseId(x.courseId), x.gameCode));
      if (!r) return;
      _recentBusy = true;
      const t0 = Date.now();
      const tick = async () => {
        try {
          if (!(typeof _bgGrowthQuiet === 'function' && _bgGrowthQuiet()) || (typeof _bgGrowthBusy !== 'undefined' && _bgGrowthBusy)) {
            if (Date.now() - t0 < 9000) { setTimeout(tick, 700); return; }
            _recentBusy = false; return;
          }
          const hp = document.getElementById('panel-home');
          if (!hp || !hp.classList.contains('active')) { _recentBusy = false; return; }
          try { localStorage.setItem(askedKey(r.gameCode), '1'); } catch (e) {}
          await window.bgRRRateSheet(baseId(r.courseId), { name: r.course, gameCode: r.gameCode, ask: true });
        } catch (e) {}
        _recentBusy = false;
      };
      setTimeout(tick, 1500);
    } catch (e) { _recentBusy = false; }
  };
})();

function bgPostFinishGrowth(g) {
  try {
    const code = (g && g.code) || '';""",
"engine"))

# ---------------- version ----------------
edits.append(("<!--BGVER=" + OLD_VER + "-->", "<!--BGVER=" + NEW_VER + "-->", "BGVER"))
edits.append(("const BG_BUILD = '" + OLD_VER + "';", "const BG_BUILD = '" + NEW_VER + "';", "BG_BUILD"))

for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old); assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', len(edits))
