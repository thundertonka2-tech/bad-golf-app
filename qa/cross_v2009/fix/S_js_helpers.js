/* ==========================================================================
   v2010 (cross audit S-1/S-3/S-4/S-6/S-7/S-11/S-12/S-13/S-14/S-19/S-20, decisions 6/7/9) — stream S
   SURFACES for cross-group bets. Every surface below READS t2ComputeCrossGroupMatches (stream E's
   output shape, FIX_CONTRACT) and never settles anything itself. _t2CrossNorm makes the older v2008
   shape (no day/keys/statusShort/pending) safe to read too, so a missing field never throws.
   ========================================================================== */
function _t2SKey(n) {   // v2010 (cross audit S-4/S-16): the one cross key (E's bgCrossKey), guarded
  try { if (typeof bgCrossKey === 'function') return bgCrossKey(n); } catch (e) {}
  try { return normalizeNameSegment(String(n == null ? '' : n)); } catch (e) { return String(n || '').toLowerCase().trim(); }
}
function _sT(s) { try { return (typeof bgT === 'function') ? bgT(s) : s; } catch (e) { return s; } }
// "{0} won ({1})" style: translate the pattern with the values in it (the dictionary's patterns do the rest).
function _sTf(tpl, vals) { let s = String(tpl); (vals || []).forEach((v, i) => { s = s.split('{' + i + '}').join(String(v == null ? '' : v)); }); return _sT(s); }
function _t2CrossNorm(res) {
  const out = { matches: [], nassaus: [], nassauGroups: [], dropped: [], conflicts: [], pendingAny: false };
  try {
    if (!res || typeof res !== 'object') return out;
    const K = _t2SKey;
    const shortOf = (st, push) => { const s = String(st || '').replace(/\s*\(thru[^)]*\)/, '').replace(/\s*-\s*(in progress|dormie|waiting on a blank hole)\s*$/, '').trim(); return s || (push ? 'AS' : ''); };
    (Array.isArray(res.matches) ? res.matches : []).forEach(m => {
      try {
        if (!m || typeof m !== 'object') return;
        const aKey = m.aKey || K(m.aName || m.aFirst), bKey = m.bKey || K(m.bName || m.bFirst);
        const settled = m.settled !== false;
        const pending = (m.pending != null) ? !!m.pending : !settled;
        const notStarted = !!(m.notStarted || m.statusShort === 'not started');
        out.matches.push(Object.assign({}, m, { kind: 'match', day: Number(m.day) || 1, aKey: aKey, bKey: bKey,
          keys: Array.isArray(m.keys) && m.keys.length ? m.keys : [aKey, bKey], settled: settled, pending: pending, notStarted: notStarted,
          statusShort: m.statusShort || shortOf(m.status, m.push), played: Number(m.played) || 0,
          holes: Array.isArray(m.holes) ? m.holes : null, value: Number(m.value) || 0, net: m.net !== false }));
        if (pending) out.pendingAny = true;
      } catch (e) {}
    });
    (Array.isArray(res.nassaus) ? res.nassaus : []).forEach(n => {
      try {
        if (!n || typeof n !== 'object') return;
        const aKey = n.aKey || K(n.aName || n.aFirst), bKey = n.bKey || K(n.bName || n.bFirst);
        const segs = (Array.isArray(n.segments) ? n.segments : []).map(s => {
          s = s || {};
          const pushed = !!(s.pushed || /pushed/i.test(String(s.status || '')));
          const noBet = !!(s.noBet || /no bet/i.test(String(s.status || '')));
          const settled = (s.settled !== false) || pushed;
          const pending = (s.pending != null) ? !!s.pending : (!settled && !noBet);
          return Object.assign({}, s, { name: String(s.name || ''), settled: settled, pending: pending, pushed: pushed, noBet: noBet, forfeit: !!s.forfeit, played: Number(s.played) || 0 });
        });
        const pending = (n.pending != null) ? !!n.pending : segs.some(s => s.pending);
        out.nassaus.push(Object.assign({}, n, { kind: 'nassau', day: Number(n.day) || 1, aKey: aKey, bKey: bKey,
          keys: Array.isArray(n.keys) && n.keys.length ? n.keys : [aKey, bKey], segments: segs, settled: !pending, pending: pending,
          aNet: Number(n.aNet) || 0, bNet: Number(n.bNet) || 0, value: Number(n.value) || 0, net: n.net !== false,
          format: n.format || 'stroke', notStarted: !!n.notStarted, holes: Array.isArray(n.holes) ? n.holes : null }));
        if (pending) out.pendingAny = true;
      } catch (e) {}
    });
    (Array.isArray(res.nassauGroups) ? res.nassauGroups : []).forEach(G => {
      try {
        if (!G || typeof G !== 'object') return;
        const players = Array.isArray(G.players) ? G.players.filter(Boolean) : [];
        const keys = (Array.isArray(G.keys) && G.keys.length) ? G.keys.slice() : players.map(p => p.key || K(p.name || p.first));
        const nb = (G.netByKey && typeof G.netByKey === 'object') ? G.netByKey : ((G.money && typeof G.money === 'object') ? G.money : {});
        const segs = (Array.isArray(G.segments) ? G.segments : []).map(s => {
          s = s || {};
          const winners = Array.isArray(s.winners) ? s.winners : [];
          const settled = (s.settled != null) ? !!s.settled : true;   // v2008 only listed segments that settled
          const pending = (s.pending != null) ? !!s.pending : false;
          return Object.assign({}, s, { name: String(s.name || ''), winners: winners, settled: settled, pending: pending, noBet: !!s.noBet });
        });
        const pending = (G.pending != null) ? !!G.pending : segs.some(s => s.pending);
        out.nassauGroups.push(Object.assign({}, G, { kind: 'nassauGroup', day: Number(G.day) || 1, keys: keys, players: players.length ? players : keys.map(k => ({ key: k, name: k, first: k })),
          netByKey: nb, segments: segs, settled: !pending, pending: pending, value: Number(G.value) || 0, net: G.net !== false, notStarted: !!G.notStarted }));
        if (pending) out.pendingAny = true;
      } catch (e) {}
    });
    out.dropped = (Array.isArray(res.dropped) ? res.dropped : []).filter(d => d && typeof d === 'object');
    out.conflicts = (Array.isArray(res.conflicts) ? res.conflicts : []).filter(c => c && typeof c === 'object');
    if (res.pendingAny) out.pendingAny = true;
  } catch (e) {}
  return out;
}
function _t2CrossCompute(t, rows) {
  try { return _t2CrossNorm((typeof t2ComputeCrossGroupMatches === 'function') ? t2ComputeCrossGroupMatches(t, rows || []) : null); }
  catch (e) { return _t2CrossNorm(null); }
}
// v2010 (cross audit S-4/S-11): labels from the WHOLE event roster, so "Mike J." / "Mike B." read the
// same on every card, chip and the public page (displayFirst used to compare only the open round).
function _t2CrossLabels(rows) {
  const byKey = {}, roster = [];
  try {
    (rows || []).forEach(row => {
      const g = row && row.data ? row.data : row;
      if (!g || !Array.isArray(g.players)) return;
      g.players.forEach(p => { if (!p || !p.name) return; const k = _t2SKey(p.name); if (byKey[k]) return; byKey[k] = { p: p, name: p.name }; roster.push(p); });
    });
    Object.keys(byKey).forEach(k => {
      let f = ''; try { f = (typeof displayFirst === 'function') ? displayFirst(byKey[k].p, roster) : ''; } catch (e) { f = ''; }
      byKey[k].first = f || String(byKey[k].name).split(/\s+/)[0];
    });
  } catch (e) {}
  return {
    first: (k, fb) => (byKey[k] && byKey[k].first) || fb || String(k || '').split(/\s+/)[0] || '?',
    name: (k, fb) => (byKey[k] && byKey[k].name) || fb || k || '?'
  };
}
// The GPS cache (_t2RefreshCrossGpsCache) is the in-round surfaces' copy of the event; the engine
// result and labels are memoised on it so a GPS tick / banner render never re-runs the engine twice.
function _t2CrossFromCache(cache, g) {
  try {
    if (!cache || !cache.t) return null;
    // the card being scored here is newer than the 20 s cache: use the live copy of THIS round
    let rows = cache.rows || [], sig = '';
    try {
      const lg = g || ((typeof state !== 'undefined' && state && state.game) ? state.game : null);
      if (lg && lg.code && lg.t2 && lg.t2.tournamentId === cache.tid) {
        let hit = false;
        rows = rows.map(r => { const d = r && r.data ? r.data : r; if (d && d.code === lg.code) { hit = true; return { data: lg }; } return r; });
        if (hit) sig = lg.code + '|' + JSON.stringify(lg.scores || {}) + '|' + (lg.finishedAt || '') + '|' + JSON.stringify(lg.leftRound || null);
        else rows = cache.rows || [];
      }
    } catch (e) { rows = cache.rows || []; sig = ''; }
    if (cache._sx && cache._sxRows === cache.rows && cache._sxSig === sig) return cache._sx;
    const X = _t2CrossCompute(cache.t, rows);
    X.labels = _t2CrossLabels(rows);
    cache._sx = X; cache._sxRows = cache.rows; cache._sxSig = sig;
    return X;
  } catch (e) { return null; }
}
function _t2CrossLead(m) {
  try {
    if (Array.isArray(m.holes) && m.holes.length) { let a = 0, b = 0; m.holes.forEach(h => { const r = String(h && h.res || ''); if (r === 'A' || r === 'a') a++; else if (r === 'B' || r === 'b') b++; }); return Math.abs(a - b); }
    const n = parseInt(String(m.statusShort || m.status || ''), 10); return isNaN(n) ? 0 : n;
  } catch (e) { return 0; }
}
// One status line for a cross MATCH, from the engine's own fields (named for the viewer).
function _t2CrossMatchLine(m, L) {
  try {
    const A = L.first(m.aKey, m.aFirst), B = L.first(m.bKey, m.bFirst);
    const W = m.winnerKey ? L.first(m.winnerKey, m.winnerKey === m.aKey ? m.aFirst : m.bFirst) : null;
    let s;
    if (m.notStarted) s = _sT('Not started');
    else if (m.forfeit) s = _sTf('{0} won ({1})', [W || '?', _sT('forfeit')]);
    else if (m.settled) s = (m.push || !W) ? _sT('Halved') : _sTf('{0} won ({1})', [W, _sT(m.statusShort)]);
    else if (m.push || !W) s = _sTf('All square thru {0}', [m.played]);
    else if (m.statusShort === 'dormie') s = _sTf('{0} dormie ({1} up thru {2})', [W, _t2CrossLead(m), m.played]);
    else s = _sTf('{0} {1} up thru {2}', [W, _t2CrossLead(m), m.played]);
    if (m.blank) s += ' · ' + _sT('waiting on a blank hole');
    else if (m.left && !m.settled) s += ' · ' + _sTf('{0} left early', [L.first(m.left.key, m.left.key === m.aKey ? A : B)]);
    return s;
  } catch (e) { return String((m && m.status) || ''); }
}
// One Nassau side (2-player), from the engine segment.
function _t2CrossSegLine(s, n, L) {
  try {
    const W = s.winnerKey ? L.first(s.winnerKey, s.winnerFirst) : (s.winnerFirst || null);
    const st = String(s.status || '').replace(/\s*[-—]+\s*(in progress|unfinished, no bet|waiting on a blank hole)\s*$/, '').trim();
    if (s.forfeit) return { text: _sTf('{0} won ({1})', [W || '?', _sT('forfeit')]), state: 'won' };
    if (s.pushed) return { text: _sT('Pushed — only one nine played'), state: 'none' };
    if (s.noBet) return { text: _sT('Unfinished — no bet'), state: 'none' };
    if (s.settled) return W ? { text: _sTf('{0} won ({1})', [W, st]), state: 'won' } : { text: _sT('Tied'), state: 'as' };
    if (!s.played) return { text: _sT('Not started'), state: 'none' };
    const tail = s.blank ? (' · ' + _sT('waiting on a blank hole')) : '';
    if (!W || /^(AS|tied)$/i.test(st)) return { text: _sTf('All square thru {0}', [s.played]) + tail, state: 'as' };
    return { text: _sTf('{0} leads ({1}) thru {2}', [W, st, s.played]) + tail, state: 'live' };
  } catch (e) { return { text: String((s && s.status) || ''), state: 'as' }; }
}
// One group-mode (3+) side.
function _t2CrossGroupSegLine(s, G, L) {
  try {
    const st = String(s.status || '');
    if (s.pending) return { text: /blank/.test(st) ? _sT('waiting on a blank hole') : (/not started/i.test(st) ? _sT('Not started') : _sT('In progress')), state: 'live' };
    if (s.noBet) return { text: _sT('Unfinished — no bet'), state: 'none' };
    const ws = (s.winners || []);
    if (ws.length === 1) return { text: _sTf('{0} won ({1})', [L.first(ws[0], s.winnerFirst), st]), state: 'won' };
    return { text: _sT(st.replace(/\s*-\s*/, ' — ')), state: 'as' };
  } catch (e) { return { text: String((s && s.status) || ''), state: 'as' }; }
}
function _t2CrossTerms(x) {
  try {
    const parts = [];
    if (x.value != null) parts.push(String(Number(x.value) || 0));
    parts.push(x.net === false ? _sT('gross') : _sT('net'));
    return parts.join(', ');
  } catch (e) { return ''; }
}
function _t2CrossNoteText(d, L, kindOf) {
  try {
    if (kindOf === 'conflict') {
      const who = (d.keys || []).map(k => L.first(k)).join(' v ');
      const kn = d.kind === 'match' ? 'Match' : 'Nassau';
      return _sTf('{0} ({1}): two carts set different terms — counted {2}, ignored {3}', [who, kn, _t2CrossTerms(d.used || {}), _t2CrossTerms(d.other || {})]);
    }
    return _sT(String(d.text || ((d.names || []).join(' v ') + ': bet dropped')));
  } catch (e) { return ''; }
}
// v2010 (cross audit S-20): the Color-blind setting reaches the cross surfaces (Matches card cells,
// GPS chips, Units) through one body class; orange/blue overrides live in the stylesheet.
function _bgCbSync() { try { if (document && document.body) document.body.classList.toggle('bg-cb', !!((typeof bgCbOn === 'function') && bgCbOn())); } catch (e) {} }
try { _bgCbSync(); document.addEventListener('change', function (e) { try { if (e && e.target && e.target.id === 'pref-colorblind') setTimeout(_bgCbSync, 0); } catch (x) {} }); } catch (e) {}
try { document.addEventListener('DOMContentLoaded', _bgCbSync); } catch (e) {}
/* v2010 (cross audit S-1/S-7): the in-round blue banners for cross bets come from the EVENT (the same
   engine result the GPS chips read), not from this card's own config -- a pick saved before launch
   (t2RemapGamesToGroup takes it off the round) or on the OTHER cart now shows on every cart in it,
   with the engine's live status. Offline / before the first fetch, the card's own picks still show
   name-only, as before. */
function _t2CrossBannerFallback(g, banners) {
  try {
    const seen = new Set();
    [g.games, g.groupGames].forEach(bag => {
      if (!bag) return;
      ['match', 'nassau'].forEach(kind => {
        const c = bag[kind]; if (!c) return;
        ((Array.isArray(c.instances) && c.instances.length) ? c.instances : [c]).forEach(inst => {
          if (!inst || typeof _nassauInstCross !== 'function' || !_nassauInstCross(g, inst)) return;
          const names = (inst.participantNames || inst.pair || []).map(n => String(n).split(/\s+/)[0]);
          const k = kind + '|' + names.slice().sort().join('|'); if (seen.has(k)) return; seen.add(k);
          const d = document.createElement('div'); d.className = 'turn-banner';
          const head = kind === 'match' ? ('⚔️ Match (cross-group): ' + names.join(' vs ')) : (bgGameIconPrefix('nassau') + 'Nassau (cross-group): ' + names.join(', '));
          d.innerHTML = '<div style="font-weight:600;margin-bottom:2px">' + escapeHtml(head) + ' <span style="font-weight:400;color:var(--text-muted);font-size:11px">· ' + escapeHtml(String(inst.value || 0)) + (kind === 'nassau' ? '/side' : '') + ' · ' + (inst.net !== false ? 'net' : 'gross') + '</span></div><div class="small-text" style="color:var(--accent);font-size:11px">⚡ Settles on the Event Leaderboard — separate from your group games.</div>';
          banners.appendChild(d);
        });
      });
    });
  } catch (e) {}
}
function _t2RenderCrossBanners(g, banners) {
  try {
    if (!g || !banners || !(g.t2 && g.t2.tournamentId)) return;
    _bgCbSync();
    const tid = g.t2.tournamentId;
    let cache = window._t2CrossGps;
    if (!cache || cache.tid !== tid || !cache.t) {
      // first fetch: draw the card's own picks now, redraw once the event arrives
      try {
        if (typeof _t2RefreshCrossGpsCache === 'function' && window._t2CrossBannerWait !== tid) {
          window._t2CrossBannerWait = tid;
          Promise.resolve(_t2RefreshCrossGpsCache(g)).then(() => {
            try { const c = window._t2CrossGps; if (c && c.tid === tid && c.t && state.game === g && typeof renderGameBanners === 'function') renderGameBanners(); } catch (e) {}
          }).catch(() => {}).then(() => { try { if (window._t2CrossBannerWait === tid) window._t2CrossBannerWait = null; } catch (e) {} });
        }
      } catch (e) {}
      _t2CrossBannerFallback(g, banners);
      return;
    }
    try { if (typeof _t2RefreshCrossGpsCache === 'function') Promise.resolve(_t2RefreshCrossGpsCache(g)).catch(() => {}); } catch (e) {}
    const X = _t2CrossFromCache(cache, g); if (!X) { _t2CrossBannerFallback(g, banners); return; }
    const L = X.labels;
    const day = Number((g.t2 && g.t2.day) || 1);
    const mine = new Set((g.players || []).filter(p => p && p.name).map(p => _t2SKey(p.name)));
    const onDay = x => x.day == null || Number(x.day) === day;
    const hasMe = keys => (keys || []).some(k => mine.has(k));
    const meta = (x, side) => ' <span style="font-weight:400;color:var(--text-muted);font-size:11px">· ' + escapeHtml(String(x.value || 0)) + (side ? '/side' : '') + ' · ' + (x.net === false ? 'gross' : 'net') + '</span>';
    const foot = '<div class="small-text" style="color:var(--accent);font-size:11px">⚡ Settles on the Event Leaderboard — separate from your group games.</div>';
    const row = (lbl, t, state) => '<div><span style="color:var(--text-muted);min-width:54px;display:inline-block">' + escapeHtml(lbl) + '</span> <span class="bg-xs bg-xs-' + state + '">' + escapeHtml(t) + '</span></div>';
    const add = html => { const d = document.createElement('div'); d.className = 'turn-banner bg-cross-banner'; d.innerHTML = html; banners.appendChild(d); };
    X.matches.filter(m => onDay(m) && hasMe([m.aKey, m.bKey])).forEach(m => {
      const A = L.first(m.aKey, m.aFirst), B = L.first(m.bKey, m.bFirst);
      const line = _t2CrossMatchLine(m, L);
      const state = m.settled ? (m.push ? 'as' : 'won') : (m.push || m.notStarted ? 'as' : 'live');
      add('<div style="font-weight:600;margin-bottom:2px">⚔️ Match (cross-group): ' + escapeHtml(A + ' vs ' + B) + meta(m, false) + '</div>'
        + '<div style="font-size:12px"><span class="bg-xs bg-xs-' + state + '">' + escapeHtml(line) + '</span></div>' + foot);
    });
    X.nassaus.filter(n => onDay(n) && hasMe([n.aKey, n.bKey])).forEach(n => {
      const A = L.first(n.aKey, n.aFirst), B = L.first(n.bKey, n.bFirst);
      let body = '';
      if (!n.segments.length) body = row('', _sT('Not started'), 'as');
      n.segments.forEach(s => { const r = _t2CrossSegLine(s, n, L); body += row(_sT((s.name === 'Total' ? 'Total' : s.name) + ':'), r.text, r.state); });
      add('<div style="font-weight:600;margin-bottom:4px">' + bgGameIconPrefix('nassau') + 'Nassau (cross-group): ' + escapeHtml(A + ' vs ' + B) + meta(n, true) + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:2px;font-size:12px">' + body + '</div>' + foot);
    });
    X.nassauGroups.filter(G => onDay(G) && hasMe(G.keys)).forEach(G => {
      const names = G.keys.map(k => L.first(k)).join(', ');
      let body = '';
      if (!G.segments.length) body = row('', _sT('Not started'), 'as');
      G.segments.forEach(s => { const r = _t2CrossGroupSegLine(s, G, L); body += row(_sT(s.name + ':'), r.text, r.state); });
      add('<div style="font-weight:600;margin-bottom:4px">' + bgGameIconPrefix('nassau') + 'Nassau (cross-group): ' + escapeHtml(names) + meta(G, true) + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:2px;font-size:12px">' + body + '</div>' + foot);
    });
    // decision 6 / S-10: a bet this card is in that won't count, or two carts that disagree -- never silent
    X.dropped.filter(d => (d.day == null || Number(d.day) === day) && hasMe(d.keys || (d.names || []).map(_t2SKey))).forEach(d => {
      add('<div class="small-text" style="font-size:12px"><span aria-hidden="true">⚠️ </span><span>' + escapeHtml(_t2CrossNoteText(d, L)) + '</span></div>');
    });
    X.conflicts.filter(c => onDay(c) && hasMe(c.keys)).forEach(c => {
      add('<div class="small-text" style="font-size:12px"><span aria-hidden="true">⚠️ </span><span>' + escapeHtml(_t2CrossNoteText(c, L, 'conflict')) + '</span></div>');
    });
  } catch (e) {}
}
/* v2010 (decision 9, Tyler 11/4): "Cross matches get their own labelled line on the group scorecard
   Match view ("Tyler · v Kevin")" -- the v1990 one-line-per-match rule, fed from the engine result.
   Cells are the engine's hole-by-hole results, placed under the column of the SLOT that played that
   hole number on this card. Returns { pid: [{row, oppName}] } or null. */
function _t2ScCrossRows(g, mkRow) {
  try {
    if (!g || !(g.t2 && g.t2.tournamentId) || !Array.isArray(g.players)) return null;
    const cache = window._t2CrossGps;
    if (!cache || cache.tid !== g.t2.tournamentId || !cache.t) {
      try { if (typeof _t2RefreshCrossGpsCache === 'function') Promise.resolve(_t2RefreshCrossGpsCache(g)).catch(() => {}); } catch (e) {}
      return null;
    }
    const X = _t2CrossFromCache(cache, g); if (!X) return null;
    const L = X.labels;
    const day = Number(g.t2.day || 1);
    const nH = (typeof roundHoles === 'function') ? (roundHoles(g) || 18) : 18;
    const slotOf = {};
    for (let s = 1; s <= nH; s++) { let ph = s; try { ph = (typeof bgPhysHole === 'function') ? bgPhysHole(g, s) : s; } catch (e) { ph = s; } if (slotOf[ph] == null) slotOf[ph] = s; }
    const byKey = {}; g.players.forEach(p => { if (p && p.name) byKey[_t2SKey(p.name)] = p; });
    const out = {};
    X.matches.forEach(m => {
      if (m.day != null && Number(m.day) !== day) return;
      [[m.aKey, m.bKey, 'A'], [m.bKey, m.aKey, 'B']].forEach(([mk, ok, side]) => {
        const p = byKey[mk]; if (!p || byKey[ok]) return;   // a cart-mate pair is in-group, not cross
        const r = mkRow();
        let up = 0, last = 0;
        (m.holes || []).forEach(h => {
          const res = String(h && h.res || '');
          if (res === side || res === side.toLowerCase()) up++; else if (res === 'A' || res === 'B' || res === 'a' || res === 'b') up--;
          const sl = slotOf[Number(h.hole)]; if (!sl) return;
          const st = _bgMuStat(up); r.cells[sl - 1] = st.t; r.cls[sl - 1] = st.c; last = Math.max(last, sl);
          if (sl === 9) r.out = st.t;
        });
        r.thru = last;
        const won = m.winnerKey === mk;
        if (m.notStarted) { r.tot = '—'; r.totCls = 'as'; }
        else if (m.settled) {
          if (m.push || !m.winnerKey) { r.tot = 'Halved'; r.totCls = 'as'; }
          else { r.tot = (won ? 'W ' : 'L ') + _sT(m.statusShort); r.totCls = won ? 'up' : 'dn'; }
        } else if (m.push || !m.winnerKey) { r.tot = 'AS thru ' + m.played; r.totCls = 'as'; }
        else { const ld = _t2CrossLead(m); r.tot = (ld + (won ? '↑' : '↓')) + ' thru ' + m.played; r.totCls = won ? 'up' : 'dn'; }
        (out[p.id] = out[p.id] || []).push({ row: r, opp: null, oppName: L.first(ok), cross: true });
      });
    });
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
/* v2010 (decision 7, S-18 read side): the permanent cross records (stream Q's tournament_matches rows
   with cross_key) are read in the background and kept per event; the Matches card falls back to them
   for a bet the live engine no longer sees (a deleted round). */
window._bgT2CrossStored = window._bgT2CrossStored || {};
async function _t2CrossStoredFetch(tid) {
  try {
    if (!tid) return [];
    const c = window._bgT2CrossStored[tid];
    if (c && (Date.now() - c.at) < 60000) return c.rows;
    if (c && c.busy) return c.rows || [];
    window._bgT2CrossStored[tid] = { at: c ? c.at : 0, rows: (c && c.rows) || [], busy: true };
    let rows = [];
    try {
      if (typeof t2GetMatches === 'function' && typeof supa !== 'undefined' && supa && supa.from) {
        const all = await Promise.race([t2GetMatches(tid), new Promise(r => setTimeout(() => r([]), 6000))]);
        rows = (Array.isArray(all) ? all : []).filter(r => r && (r.cross_key || String(r.format || '').indexOf('cross-') === 0));
      }
    } catch (e) { rows = []; }
    window._bgT2CrossStored[tid] = { at: Date.now(), rows: rows, busy: false };
    return rows;
  } catch (e) { return []; }
}
function _t2CrossStoredGet(tid) {
  try {
    const c = window._bgT2CrossStored[tid];
    if (!c || (!c.busy && (Date.now() - c.at) >= 60000)) { Promise.resolve(_t2CrossStoredFetch(tid)).catch(() => {}); }
    return (c && c.rows) || [];
  } catch (e) { return []; }
}
// Stored row -> an engine-shaped entry (FIX_CONTRACT shape; Q stores detail = the row as sent).
function _t2CrossFromStored(r) {
  try {
    const d = (r && r.detail && typeof r.detail === 'object') ? r.detail : {};
    const fm = String(r.format || '');
    const kind = d.kind || (fm === 'cross-match' ? 'match' : (fm === 'cross-nassau' ? 'nassau' : (fm === 'cross-nassau-group' ? 'nassauGroup' : null)));
    if (!kind) return null;
    const keys = Array.isArray(d.keys) ? d.keys : [];
    const names = Array.isArray(d.names) ? d.names : keys;
    const nm = k => { const i = keys.indexOf(k); return i >= 0 ? (names[i] || k) : k; };
    const aKey = d.aKey || keys[0], bKey = d.bKey || keys[1];
    const base = { day: Number(d.day) || 1, kind: kind, keys: keys, settled: true, pending: false, value: Number(d.value) || 0, net: d.net !== false, stored: true,
      aKey: aKey, bKey: bKey, aName: nm(aKey), bName: nm(bKey), aFirst: String(nm(aKey) || '').split(/\s+/)[0], bFirst: String(nm(bKey) || '').split(/\s+/)[0] };
    if (kind === 'match') return Object.assign(base, { winnerKey: d.winnerKey || null, loserKey: d.winnerKey ? (d.winnerKey === aKey ? bKey : aKey) : null, push: !!d.push || !d.winnerKey, status: d.status || '', statusShort: d.statusShort || '', holes: Array.isArray(d.holes) ? d.holes : [], played: Array.isArray(d.holes) ? d.holes.length : 0 });
    if (kind === 'nassau') return Object.assign(base, { segments: Array.isArray(d.segments) ? d.segments : [], format: d.format || 'stroke', aNet: Number(d.aPoints) || 0, bNet: Number(d.bPoints) || 0 });
    return Object.assign(base, { segments: Array.isArray(d.segments) ? d.segments : [], netByKey: (d.netByKey && typeof d.netByKey === 'object') ? d.netByKey : {}, players: keys.map(k => ({ key: k, name: nm(k), first: String(nm(k) || '').split(/\s+/)[0] })) });
  } catch (e) { return null; }
}
// v2010 (decision 9): a player whose only matches are cross bets -> the v1990 per-match lines, one per bet.
function _bgScCrossOnly(rows, cx, mkRow) {
  try {
    const multi = {};
    Object.keys(cx || {}).forEach(pid => {
      const list = cx[pid] || []; if (!list.length) return;
      multi[pid] = list.map(x => ({ row: x.row, opp: null, oppName: x.oppName, cross: true }));
      if (list.length < 2) { rows[pid] = list[0].row; return; }
      const r = mkRow();
      const ini = x => String(x.oppName || '?').charAt(0).toUpperCase();
      for (let i = 0; i < 18; i++) {
        const parts = list.filter(x => x.row.cells[i]).map(x => '<span class="sc-mu-' + (x.row.cls[i] || 'as') + '">' + x.row.cells[i] + '</span><small>' + escapeHtml(ini(x)) + '</small>');
        r.cells[i] = parts.length ? '<span class="sc-mu-multi">' + parts.join('<br>') + '</span>' : ''; r.cls[i] = 'multi';
      }
      r.tot = '<span class="sc-mu-multi">' + list.map(x => '<span class="sc-mu-' + (x.row.totCls || 'as') + '">' + escapeHtml(x.row.tot || '—') + '</span><small>v ' + escapeHtml(x.oppName || '?') + '</small>').join('<br>') + '</span>';
      r.totCls = 'multi'; r.thru = Math.max.apply(null, list.map(x => x.row.thru || 0));
      rows[pid] = r;
    });
    if (Object.keys(multi).length) rows._multi = multi;
    return Object.keys(multi).length > 0;
  } catch (e) { return false; }
}
