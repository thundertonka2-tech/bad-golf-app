function t2EventMatchModels(t, rows) {
  /* v2010 (cross audit S-6/S-7/S-11/S-13/S-14, ENG-10/ENG-11 display, decision 7): CROSS cards are
     READ from t2ComputeCrossGroupMatches -- one card per engine bet, bound to its day; the hole row is
     the engine's own hole-by-hole result in HOLE-NUMBER order, stopping where the engine stopped; the
     Nassau sides are the engine's segments (no "18" on a Front & Back bet, a pushed Total reads
     pushed); a group-mode (3+) Nassau gets its own card; nothing is drawn for a bet the engine has
     not got (no phantom card). In-group bets still come from each round's own calcMatch / calcNassau.
     Labels use the whole field roster (displayFirst with every player), so the public page and the
     app read the same. A settled bet whose round has since been deleted falls back to its permanent
     record (stream Q's tournament_matches rows). Dropped / conflicting bets ride along as models.notes. */
  const out = [];
  try {
    const X = _t2CrossCompute(t, rows);
    const L = _t2CrossLabels(rows);
    let byDay = {}; try { byDay = (typeof _t2EventPdataByDay === 'function') ? (_t2EventPdataByDay(rows) || {}) : {}; } catch (e) { byDay = {}; }
    const pd = (day, k) => { try { return (byDay[day] && byDay[day].pdata && byDay[day].pdata[k]) || null; } catch (e) { return null; } };
    const val = (P, h, net) => {
      try {
        if (!P) return null;
        if (typeof _t2CrossVal === 'function' && P.byHole) return _t2CrossVal(P, h, net);
        if (P.byHole && P.byHole[h]) return net ? P.byHole[h].n : P.byHole[h].g;
        const arr = net ? P.net : P.gross; return Array.isArray(arr) ? (arr[h - 1] != null ? arr[h - 1] : null) : null;
      } catch (e) { return null; }
    };
    const sharedOf = (day, keys, fb) => {
      try {
        const Ps = keys.map(k => pd(day, k));
        if (Ps.every(Boolean) && typeof _t2CrossShared === 'function' && Ps.every(P => Array.isArray(P.planned))) { const s = _t2CrossShared(Ps); if (s && s.length) return s.slice(); }
      } catch (e) {}
      if (Array.isArray(fb) && fb.length) return fb.slice().sort((a, b) => a - b);
      const o = []; for (let h = 1; h <= 18; h++) o.push(h); return o;
    };
    const blankRow = n => ({ cells: new Array(n).fill(''), cls: new Array(n).fill('') });
    const flip = (r) => ({ cells: r.cells.map(c => c ? (c === 'AS' ? 'AS' : (c.indexOf('↑') >= 0 ? c.replace('↑', '↓') : c.replace('↓', '↑'))) : ''), cls: r.cls.map(c => c === 'up' ? 'dn' : (c === 'dn' ? 'up' : c)) });
    const seen = new Set();
    const keyOf = (day, kind, keys) => day + '|' + kind + '|' + (keys || []).slice().sort().join(',');
    // ---- cross 1v1 matches (engine) ----
    const matchModel = (m) => {
      const cols = sharedOf(m.day, [m.aKey, m.bKey], (m.holes || []).map(h => Number(h.hole)));
      const ra = blankRow(cols.length);
      let up = 0;
      (m.holes || []).forEach(h => {
        const i = cols.indexOf(Number(h && h.hole)); const r = String(h && h.res || '');
        if (r === 'A' || r === 'a') up++; else if (r === 'B' || r === 'b') up--;
        if (i < 0) return;
        const s = _bgMuStat(up); ra.cells[i] = s.t; ra.cls[i] = s.c;
      });
      const rb = flip(ra);
      let totA = '—', totB = '—', tcA = 'as', tcB = 'as';
      const aWon = m.winnerKey === m.aKey;
      if (m.notStarted) { totA = totB = _sT('Not started'); }
      else if (m.settled) {
        if (m.push || !m.winnerKey) { totA = totB = 'Halved'; }
        else { const ss = _sT(m.statusShort || ''); totA = (aWon ? 'W ' : 'L ') + ss; totB = (aWon ? 'L ' : 'W ') + ss; tcA = aWon ? 'up' : 'dn'; tcB = aWon ? 'dn' : 'up'; }
      } else if (m.push || !m.winnerKey) { totA = totB = 'AS thru ' + m.played; }
      else {
        const ld = _t2CrossLead(m), tail = (m.statusShort === 'dormie') ? (' · ' + _sT('dormie')) : '';
        totA = ld + (aWon ? '↑' : '↓') + ' thru ' + m.played + tail; totB = ld + (aWon ? '↓' : '↑') + ' thru ' + m.played + tail; tcA = aWon ? 'up' : 'dn'; tcB = aWon ? 'dn' : 'up';
      }
      const note = m.blank ? _sT('waiting on a blank hole') : ((m.left && m.left.key) ? _sTf('{0} left early', [L.first(m.left.key)]) : '');
      return { kind: 'match', day: m.day, cross: true, net: m.net !== false, value: Number(m.value) || 0, nH: cols.length, cols: cols, pending: !!m.pending, stored: !!m.stored, note: note,
        a: { first: L.first(m.aKey, m.aFirst), name: L.name(m.aKey, m.aName), cells: ra.cells, cls: ra.cls, tot: totA, totCls: tcA },
        b: Object.assign({ first: L.first(m.bKey, m.bFirst), name: L.name(m.bKey, m.bName), tot: totB, totCls: tcB }, rb) };
    };
    // ---- cross 2-player Nassau (engine) ----
    const nassauModel = (n) => {
      const cols = (Array.isArray(n.holes) && n.holes.length) ? n.holes.map(Number).sort((a, b) => a - b) : sharedOf(n.day, [n.aKey, n.bKey]);
      const A = pd(n.day, n.aKey), B = pd(n.day, n.bKey), net = n.net !== false;
      const ra = blankRow(cols.length), rb = blankRow(cols.length);
      (n.segments || []).forEach(s => {
        const from = Number(s.holesFrom), to = Number(s.holesTo);
        if (!(from >= 1 && to >= from) || s.name === 'Total') return;   // the hole row shows the two nines
        let d = 0, up = 0;
        cols.forEach((h, i) => {
          if (h < from || h > to) return;
          const va = val(A, h, net), vb = val(B, h, net); if (va == null || vb == null) return;
          if (n.format === 'match') { if (va < vb) up++; else if (vb < va) up--; const sa = _bgMuStat(up), sb = _bgMuStat(-up); ra.cells[i] = sa.t; ra.cls[i] = sa.c; rb.cells[i] = sb.t; rb.cls[i] = sb.c; }
          else { d += (va - vb); ra.cells[i] = d === 0 ? 'E' : (d < 0 ? ('−' + (-d)) : ('+' + d)); ra.cls[i] = d < 0 ? 'up' : (d > 0 ? 'dn' : 'as'); rb.cells[i] = d === 0 ? 'E' : (d > 0 ? ('−' + d) : ('+' + (-d))); rb.cls[i] = d > 0 ? 'up' : (d < 0 ? 'dn' : 'as'); }
        });
      });
      const segs = (n.segments || []).map(s => { const r = _t2CrossSegLine(s, n, L); return { name: s.name === 'Total' ? '18' : s.name, text: r.text, cls: r.state === 'none' ? 'none' : 'as', state: r.state }; });
      if (!segs.length) segs.push({ name: 'Front', text: _sT('Not started'), cls: 'none', state: 'none' });
      const units = (k) => (k === n.aKey ? n.aNet : n.bNet) || 0;
      return { kind: 'nassau', day: n.day, cross: true, net: net, fmt: n.format || 'stroke', value: Number(n.value) || 0, nH: cols.length, cols: cols, segs: segs, pending: !!n.pending, stored: !!n.stored,
        a: Object.assign({ first: L.first(n.aKey, n.aFirst), name: L.name(n.aKey, n.aName), units: units(n.aKey) }, ra),
        b: Object.assign({ first: L.first(n.bKey, n.bFirst), name: L.name(n.bKey, n.bName), units: units(n.bKey) }, rb) };
    };
    // ---- cross group-mode Nassau (engine) ----
    const groupModel = (G) => {
      const cols = (Array.isArray(G.holes) && G.holes.length) ? G.holes.map(Number).sort((a, b) => a - b) : sharedOf(G.day, G.keys);
      const net = G.net !== false;
      const players = G.keys.map(k => {
        const P = pd(G.day, k), r = blankRow(cols.length);
        (G.segments || []).forEach(s => {
          const from = Number(s.holesFrom), to = Number(s.holesTo); if (!(from >= 1 && to >= from) || s.name === 'Total') return;
          let tot = 0;
          cols.forEach((h, i) => { if (h < from || h > to) return; const v = val(P, h, net); if (v == null) return; tot += v; r.cells[i] = String(tot); r.cls[i] = 'as'; });
        });
        const u = Number(G.netByKey && G.netByKey[k]) || 0;
        return Object.assign({ key: k, first: L.first(k), name: L.name(k), units: u, tot: (u > 0 ? '+' : (u < 0 ? '−' : '')) + Math.abs(bgWhole(u)), totCls: u > 0 ? 'up' : (u < 0 ? 'dn' : 'as') }, r);
      });
      const segs = (G.segments || []).map(s => { const r = _t2CrossGroupSegLine(s, G, L); return { name: s.name === 'Total' ? '18' : s.name, text: r.text, cls: r.state === 'none' ? 'none' : 'as', state: r.state }; });
      if (!segs.length) segs.push({ name: 'Front', text: _sT('Not started'), cls: 'none', state: 'none' });
      return { kind: 'nassauGroup', day: G.day, cross: true, net: net, fmt: 'stroke', value: Number(G.value) || 0, nH: cols.length, cols: cols, segs: segs, players: players, pending: !!G.pending, stored: !!G.stored };
    };
    X.matches.forEach(m => { try { seen.add(keyOf(m.day, 'match', m.keys)); out.push(matchModel(m)); } catch (e) {} });
    X.nassaus.forEach(n => { try { seen.add(keyOf(n.day, 'nassau', n.keys)); out.push(nassauModel(n)); } catch (e) {} });
    X.nassauGroups.forEach(G => { try { seen.add(keyOf(G.day, 'nassauGroup', G.keys)); out.push(groupModel(G)); } catch (e) {} });
    // ---- decision 7: a settled bet the live engine no longer sees (deleted round) -> its permanent record ----
    try {
      const tid = t && t.id;
      const stored = tid ? _t2CrossStoredGet(tid) : [];
      (stored || []).forEach(r => {
        const e = _t2CrossFromStored(r); if (!e) return;
        const k = keyOf(e.day, e.kind, e.keys); if (seen.has(k)) return; seen.add(k);
        const N = _t2CrossNorm(e.kind === 'match' ? { matches: [e] } : (e.kind === 'nassau' ? { nassaus: [e] } : { nassauGroups: [e] }));
        const x = (N.matches[0] || N.nassaus[0] || N.nassauGroups[0]); if (!x) return;
        x.stored = true;
        const md = e.kind === 'match' ? matchModel(x) : (e.kind === 'nassau' ? nassauModel(x) : groupModel(x));
        md.stored = true; out.push(md);
      });
    } catch (e) {}
    // ---- in-group 1v1 / Nassau: each round's own engines (unchanged rules; display only) ----
    (rows || []).forEach(row => {
      try {
        const g = row && row.data ? row.data : row;
        if (!g || !Array.isArray(g.players) || !g.games) return;
        const day = Number((g.t2 && g.t2.day) || 1);
        const nHr = (typeof roundHoles === 'function') ? (roundHoles(g) || 18) : 18;
        const cols = []; for (let s = 1; s <= nHr; s++) { let ph = s; try { ph = (typeof bgPhysHole === 'function') ? bgPhysHole(g, s) : s; } catch (e) { ph = s; } cols.push(ph); }
        const pOf = id => g.players.find(p => p && p.id === id);
        const kOf = id => { const p = pOf(id); return p ? _t2SKey(p.name) : ''; };
        if (g.games.match && typeof calcMatch === 'function') {
          let cm = null; try { cm = calcMatch(g); } catch (e) { cm = null; }
          ((cm && cm.matches) || []).forEach(m => {
            const ka = kOf(m.aId), kb = kOf(m.bId); if (!ka || !kb) return;
            const k = keyOf(day, 'match', [ka, kb]); if (seen.has(k)) return; seen.add(k);
            const ra = blankRow(nHr); let up = 0;
            (m.holes || []).forEach(h => { if (h.res === 'a') up++; else if (h.res === 'b') up--; const i = Number(h.hole) - 1; if (i >= 0 && i < nHr) { const s = _bgMuStat(up); ra.cells[i] = s.t; ra.cls[i] = s.c; } });
            const rb = flip(ra);
            let totA = '—', totB = '—', tcA = 'as', tcB = 'as';
            const fu = Number(m.finalUp) || 0;
            if (m.complete) {
              const sc = String(m.closedScore || (Math.abs(fu) + ' up'));
              if (m.winner === 'AS' || fu === 0) totA = totB = 'Halved';
              else { const aw = fu > 0; totA = (aw ? 'W ' : 'L ') + sc; totB = (aw ? 'L ' : 'W ') + sc; tcA = aw ? 'up' : 'dn'; tcB = aw ? 'dn' : 'up'; }
            } else if (m.played > 0) {
              if (fu === 0) totA = totB = 'AS thru ' + m.played;
              else { const aw = fu > 0; totA = Math.abs(fu) + (aw ? '↑' : '↓') + ' thru ' + m.played; totB = Math.abs(fu) + (aw ? '↓' : '↑') + ' thru ' + m.played; tcA = aw ? 'up' : 'dn'; tcB = aw ? 'dn' : 'up'; }
            }
            out.push({ kind: 'match', day: day, cross: false, net: true, value: Number(m.value) || 0, nH: nHr, cols: cols,
              a: { first: L.first(ka), name: L.name(ka), cells: ra.cells, cls: ra.cls, tot: totA, totCls: tcA },
              b: Object.assign({ first: L.first(kb), name: L.name(kb), tot: totB, totCls: tcB }, rb) });
          });
        }
        if (g.games.nassau && typeof calcNassau === 'function') {
          let cn = null; try { cn = calcNassau(g); } catch (e) { cn = null; }
          ((cn && cn.matches) || []).forEach(m => {
            if (m.groupMode || !m.aId || !m.bId) return;
            const ka = kOf(m.aId), kb = kOf(m.bId); if (!ka || !kb) return;
            const k = keyOf(day, 'nassau', [ka, kb]); if (seen.has(k)) return; seen.add(k);
            const pa = pOf(m.aId), pb = pOf(m.bId);
            const fx = s => { let x = String(s == null ? '' : s); try { if (pa && pa.name) x = x.split(pa.name).join(L.first(ka)); if (pb && pb.name) x = x.split(pb.name).join(L.first(kb)); } catch (e) {} return x; };
            const segs = [];
            if (nHr === 9) segs.push({ name: 'Front', text: m.overall != null ? fx(m.overall) : '—', cls: m.overall != null ? 'as' : 'none' });
            else {
              segs.push({ name: 'Front', text: m.front != null ? fx(m.front) : '—', cls: m.front != null ? 'as' : 'none' });
              segs.push({ name: 'Back', text: m.back != null ? fx(m.back) : '—', cls: m.back != null ? 'as' : 'none' });
              const inst = (cn.instances || [])[m.instanceIdx] || {};
              if (inst.segments !== 'fb') segs.push({ name: '18', text: m.overall != null ? fx(m.overall) : '—', cls: m.overall != null ? 'as' : 'none' });
            }
            const e0 = blankRow(nHr);
            out.push({ kind: 'nassau', day: day, cross: false, net: true, fmt: (cn.format || 'stroke'), value: Number(m.value) || 0, nH: nHr, cols: cols, segs: segs,
              a: Object.assign({ first: L.first(ka), name: L.name(ka) }, e0), b: Object.assign({ first: L.first(kb), name: L.name(kb) }, blankRow(nHr)) });
          });
        }
      } catch (e) {}
    });
    out.sort((x, y) => (x.day - y.day) || ((y.cross ? 1 : 0) - (x.cross ? 1 : 0)));
    // ---- decision 6 / S-10: never silent ----
    const notes = [];
    X.dropped.forEach(d => { const tx = _t2CrossNoteText(d, L); if (tx) notes.push({ day: d.day == null ? null : Number(d.day), kind: 'dropped', pending: !!d.pending, reason: d.reason || '', text: tx }); });
    X.conflicts.forEach(c => { const tx = _t2CrossNoteText(c, L, 'conflict'); if (tx) notes.push({ day: Number(c.day) || 1, kind: 'conflict', text: tx }); });
    out.notes = notes;
    return out;
  } catch (e) { try { out.notes = out.notes || []; } catch (e2) {} return out; }
}
function t2EventMatchesHtml(models) {
  try {
    const notes = (models && Array.isArray(models.notes)) ? models.notes : [];
    if ((!models || !models.length) && !notes.length) return '<div class="help-text" style="padding:8px 0">No match play or Nassau in this event yet.</div>';
    const list = models || [];
    const days = [...new Set(list.map(m => m.day).concat(notes.map(n => n.day == null ? 0 : n.day)))].sort((a, b) => a - b);
    const cell = 'padding:3px 4px;text-align:center;border-bottom:1px solid var(--border)';
    const stick = 'position:sticky;left:0;background:var(--surface);text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);z-index:1;font-weight:600;white-space:nowrap;max-width:96px;overflow:hidden;text-overflow:ellipsis';
    const multiDay = days.filter(d => d > 0).length > 1;
    const segCls = s => (s.state === 'won' ? 'bg-xs-won' : (s.state === 'live' ? 'bg-xs-live' : (s.state === 'none' ? 'bg-xs-none' : 'bg-xs-as')));
    let h = '';
    days.forEach(day => {
      if (multiDay && day > 0) h += '<div style="font-weight:700;margin:8px 0 4px">' + escapeHtml(_sTf('Day {0}', [day])) + '</div>';
      list.filter(m => m.day === day).forEach(m => {
        const kindLbl = m.kind === 'match' ? '⚔️ Match play' : ('💰 Nassau' + (m.kind === 'nassauGroup' ? ' (' + ((m.players || []).length) + ')' : ''));
        const tags = (m.cross ? ' <span class="small-text" style="color:var(--accent);font-weight:400">' + escapeHtml(_sT('· cross-group')) + '</span>' : '')
          + (m.pending ? ' <span class="small-text" style="color:var(--text-muted);font-weight:400">· ' + escapeHtml(_sT('pending')) + '</span>' : '')
          + (m.stored ? ' <span class="small-text" style="color:var(--text-muted);font-weight:400">· ' + escapeHtml(_sT('saved result')) + '</span>' : '');
        const title = kindLbl + tags + ' <span class="small-text" style="color:var(--text-muted);font-weight:400">· ' + escapeHtml(m.net ? _sT('net') : _sT('gross')) + (m.value ? ' · ' + escapeHtml(String(m.value)) + (m.kind === 'match' ? '' : '/side') : '') + '</span>';
        const cols = Array.isArray(m.cols) && m.cols.length ? m.cols : Array.from({ length: m.nH || 18 }, (_, i) => i + 1);
        h += '<div class="evt-mc" style="margin:6px 0 10px;padding:8px 8px 6px;background:var(--surface-2);border-radius:10px">';
        h += '<div style="font-weight:700;font-size:13px;margin-bottom:4px">' + title + '</div>';
        h += '<div class="evt-sc" style="overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%"><table style="border-collapse:collapse;font-size:11px;white-space:nowrap;min-width:100%"><tr><th style="' + stick + ';font-weight:500;color:var(--text-muted)">' + escapeHtml(_sT('Hole')) + '</th>';
        cols.forEach(c => { h += '<th style="' + cell + ';color:var(--text-muted);font-weight:500">' + escapeHtml(String(c)) + '</th>'; });
        const lastHead = m.kind === 'match' ? 'Result' : (m.kind === 'nassauGroup' ? _sT('Units') : '');
        h += '<th style="' + cell + ';font-weight:700">' + escapeHtml(lastHead) + '</th></tr>';
        const sides = m.kind === 'nassauGroup' ? (m.players || []) : [m.a, m.b];
        sides.forEach(side => {
          if (!side) return;
          h += '<tr><td style="' + stick + '">' + escapeHtml(side.first || '') + '</td>';
          for (let i = 0; i < cols.length; i++) h += '<td style="' + cell + '">' + _bgScCellHtml((side.cells || [])[i], (side.cls || [])[i]) + '</td>';
          h += '<td style="' + cell + '">' + ((m.kind === 'nassau') ? '' : '<span class="sc-mu sc-mu-tot sc-mu-' + (side.totCls || 'as') + '">' + escapeHtml(side.tot || '—') + '</span>') + '</td></tr>';
        });
        h += '</table></div>';
        if (m.kind !== 'match') h += '<div class="small-text" style="margin-top:4px;display:flex;flex-direction:column;gap:2px">' + (m.segs || []).map(s => '<span><strong>' + escapeHtml(s.name === '18' ? _sT('Total') : _sT(s.name)) + ':</strong> <span class="bg-xs ' + segCls(s) + '" style="font-size:11px">' + escapeHtml(s.text) + '</span></span>').join('') + '</div>';
        if (m.note) h += '<div class="small-text" style="margin-top:4px;color:var(--text-muted)">' + escapeHtml(m.note) + '</div>';
        h += '</div>';
      });
      notes.filter(n => (n.day == null ? 0 : n.day) === day).forEach(n => {
        h += '<div class="evt-mc-note small-text" style="margin:4px 0 8px;padding:6px 8px;border:1px dashed var(--border);border-radius:8px;overflow-wrap:anywhere"><span aria-hidden="true">⚠️ </span>' + escapeHtml(n.text) + '</div>';
      });
    });
    return h;
  } catch (e) { return ''; }
}
