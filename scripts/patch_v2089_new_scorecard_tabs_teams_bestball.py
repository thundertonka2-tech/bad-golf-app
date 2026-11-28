#!/usr/bin/env python3
# v2026.11.2089 -- Tyler, 11/27 5:39pm, on the new Score-screen scorecard:
#   1. "yes build the new one for all of them"  (the Match / Units / Quota / 11's tabs)   + "we used to have a units tab
#      and a matches tab with the old score card, we need that back as well."
#   2. "design a new team version"              (Scramble, Ryder Cup: one card per team)
#   3. "Yes"                                    (the tournament cart's team best-ball line, as a team card below the players)
# His picks: scores PLUS a game line on each tab; rows ordered by that game's standing with its result as the big
# number; one card per team; best ball below the players.
# How: the classic table is still rendered (hidden) and already carries every tab's per-hole value, total, footer
# line and row order. The new card reads those from it, so every game the classic card can show, this one shows the same.
import sys, io
OLD_V, NEW_V = 'v2026.11.2088', 'v2026.11.2089'

JS = r"""// ---- v2089: everything the hidden classic table knows, read back as plain data ----
function _bgSsTxt(html) { try { const d = document.createElement('div'); d.innerHTML = String(html == null ? '' : html); return (d.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } }
function _bgSsKey(mode) { mode = String(mode || ''); return mode === 'match' ? 'scMatch' : mode === 'units' ? 'scUnits' : mode === 'quota' ? 'scQuota' : (mode.indexOf('pt:') === 0 && typeof _bgPtDs === 'function') ? _bgPtDs(mode.slice(3)) : ''; }
function bgScStandDom(g) {
  const D = { tabs: [], mode: 'strokes', cols: [], head: [], players: {}, order: [], teams: [], bb: [], bands: [], cap: '', label: '' };
  try {
    const t = document.getElementById('scorecard-score-tab'); if (!t) return D;
    D.mode = t.dataset.scMode || 'strokes';
    t.querySelectorAll('caption .sc-tab').forEach(b => { D.tabs.push({ mode: b.dataset.mode, label: (b.textContent || '').trim() }); });
    const cur = D.tabs.find(x => x.mode === D.mode); D.label = cur ? cur.label : '';
    const key = _bgSsKey(D.mode);
    const hrows = Array.from(t.querySelectorAll('thead tr')); if (!hrows.length) return D;
    Array.from(hrows[0].cells).forEach((c, ci) => { if (!ci) return; const x = (c.childNodes[0] && c.childNodes[0].nodeType === 3 ? c.childNodes[0].textContent : c.textContent || '').trim(); const n = parseInt(x, 10);
      D.cols.push((String(n) === x && n >= 1 && n <= 18) ? { ci: ci, hole: n } : { ci: ci, key: /^out/i.test(x) ? 'out' : /^in/i.test(x) ? 'in' : 'tot' }); });
    hrows.slice(1).forEach(tr => { const o = { label: (tr.cells[0] ? tr.cells[0].textContent : '').trim(), hcp: tr.classList.contains('sc-hcp') || /^hcp$/i.test((tr.cells[0] ? tr.cells[0].textContent : '').trim()), vals: {} }; if (/^[A-Za-z]/.test(o.label) && tr.cells.length <= 2) return;
      D.cols.forEach(c => { const td = tr.cells[c.ci]; if (td) o.vals[c.hole || c.key] = (td.textContent || '').trim(); }); D.head.push(o); });
    const cellsOf = tr => { const o = {}; D.cols.forEach(c => { const td = tr.cells[c.ci]; if (!td) return; const k = c.hole || c.key;
        const oh = td.dataset.scOrig != null ? td.dataset.scOrig : td.innerHTML; const ah = key && td.dataset[key] != null ? td.dataset[key] : null;
        o[k] = { o: _bgSsTxt(oh), a: ah == null ? null : _bgSsTxt(ah), toss: ah != null && /<s[\s>]/i.test(ah) }; }); return o; };
    let curP = null;
    t.querySelectorAll('tbody').forEach(tb => {
      if (tb.classList.contains('sc-units-band')) { if (D.mode === 'units') Array.from(tb.rows).forEach(tr => { const x = (tr.textContent || '').replace(/\s+/g, ' ').trim(); if (x) D.bands.push(x); }); return; }
      Array.from(tb.rows).forEach(tr => {
        if (tr.dataset.pid && !tr.dataset.scExtra) { curP = { pid: tr.dataset.pid, cells: cellsOf(tr), extras: [], foot: [] }; D.players[curP.pid] = curP; D.order.push(curP.pid); return; }
        if (tr.dataset.scExtra) { if (curP && D.mode === 'match') { const nm = tr.cells[0]; let lab = ''; try { const kids = nm.querySelectorAll('div, span, small'); lab = kids.length ? (kids[kids.length - 1].textContent || '').trim() : ''; } catch (e) {} if (!/^v\b/i.test(lab)) { const m = /\bv\.?\s+\S.*$/i.exec((nm.textContent || '').trim()); lab = m ? m[0] : lab; } curP.extras.push({ label: lab, cells: cellsOf(tr) }); } return; }
        if (tr.classList.contains('sc-q-foot')) { const on = tr.classList.contains('sc-p-foot') ? tr.dataset.pmode === D.mode : D.mode === 'quota'; if (!on) return; const x = (tr.textContent || '').replace(/\s+/g, ' ').trim(); if (!x) return; if (tr.dataset.qteam || !curP) D.bands.push(x); else curP.foot.push(x); return; }
        if (tr.cells.length < 4) return;
        const first = tr.cells[0]; let name = '', sub = '';
        try { const dv = first.querySelector('div'); sub = dv ? (dv.textContent || '').trim() : ''; name = (first.textContent || '').trim(); if (sub && name.slice(-sub.length) === sub) name = name.slice(0, name.length - sub.length).trim(); name = name.replace(/^[^\w(]+/, '').trim(); } catch (e) {}
        const E = { name: name, sub: sub, team: tr.dataset.team || '', cells: cellsOf(tr) };
        if (tr.classList.contains('sc-team-row')) { if (D.mode !== 'quota' && D.mode.indexOf('pt:') !== 0) D.bb.push(E); } else D.teams.push(E);
        curP = null;
      });
    });
    // Match lines are labelled "v Kevin" by the classic card; with two Kevins that is no label at all, so name the opponent the way this card names players ("v Kevin W.").
    try { if (D.mode === 'match' && g.games && g.games.match && typeof calcMatch === 'function') { const cm = calcMatch(g); const ms = (cm && cm.matches) || [];
      Object.keys(D.players).forEach(pid => { const P = D.players[pid]; if (!P.extras.length) return; const mine = ms.filter(m => m.aId === pid || m.bId === pid);
        mine.forEach((m, i) => { if (!P.extras[i]) return; const opp = (g.players || []).find(x => x && x.id === (m.aId === pid ? m.bId : m.aId)); if (opp) P.extras[i].label = 'v ' + ((typeof displayFirst === 'function') ? displayFirst(opp, g.players) : opp.name); }); }); } } catch (e) {}
    try { const qc = t.querySelector('caption .sc-q-cap'); if (D.mode === 'quota' && qc) D.cap = (qc.textContent || '').trim(); t.querySelectorAll('caption .sc-p-cap').forEach(el => { if (el.dataset.pmode === D.mode) D.cap = (el.textContent || '').trim(); }); } catch (e) {}
  } catch (e) {}
  return D;
}
// A game result as a number, for ordering rows on a tab (higher is better).
function _bgSsRankVal(mode, txt) {
  try {
    const s = String(txt || '').replace(/−/g, '-');
    if (mode === 'match') { const m = /(\d+)\s*([↑↓])/.exec(s); if (/^W\b/.test(s)) return 1000; if (/^L\b/.test(s)) return -1000; if (m) return m[2] === '↑' ? Number(m[1]) : -Number(m[1]); if (/AS|Halved/i.test(s)) return 0; return -5000; }
    const n = parseFloat(s.replace(/[^0-9.+-]/g, '')); return isFinite(n) ? n : -5000;
  } catch (e) { return -5000; }
}
function _bgSsGvCls(v) { const s = String(v || ''); return /↑/.test(s) || /^\+/.test(s) ? 'bg-ss-gv-up' : (/↓/.test(s) || /^[−-]\d/.test(s)) ? 'bg-ss-gv-dn' : (s === '' || s === '·' || s === '—' || s === '–') ? 'bg-ss-gv-none' : ''; }
// One game line for a nine: the tab's value under every hole, its nine total at the end.
function _bgSsGameLine(cells, N, lab) {
  let h = '';
  for (let i = N.from; i < N.from + 9; i++) { const c = cells[i + 1]; const v = c && c.a != null ? c.a : ''; h += '<span class="bg-ss-gv ' + _bgSsGvCls(v) + (c && c.toss ? ' bg-ss-gv-toss' : '') + '">' + escapeHtml(v === '' ? '·' : v) + '</span>'; }
  const e = cells[N.lbl === 'OUT' ? 'out' : 'in']; const ev = e && e.a != null ? e.a : '';
  return '<div class="bg-ss-line bg-ss-line-g"><span class="bg-ss-lab">' + escapeHtml(lab || '') + '</span>' + h + '<span class="bg-ss-gv bg-ss-gsum ' + _bgSsGvCls(ev) + '">' + escapeHtml(ev) + '</span></div>';
}
function _bgSsShort(label) { const s = String(label || '').replace(/^[^\w']+/, '').trim(); return /match/i.test(s) ? 'Match' : s.length > 6 ? s.slice(0, 5) + '.' : s; }
function bgScStandHtml(g, M, D) {
  const T = s => { try { return (typeof bgT === 'function') ? bgT(s) : s; } catch (e) { return s; } };
  D = D || { tabs: [], mode: 'strokes', players: {}, order: [], teams: [], bb: [], bands: [], head: [], cap: '', label: '' };
  const mode = D.mode || 'strokes', game = mode !== 'strokes', gLab = _bgSsShort(D.label);
  let html = '';
  if (D.tabs.length > 1) html += '<div class="bg-ss-tabs" role="tablist">' + D.tabs.map(tb => '<button type="button" role="tab" class="bg-btn bg-btn--chip bg-ss-tab' + (tb.mode === mode ? ' is-on' : '') + '" aria-selected="' + (tb.mode === mode ? 'true' : 'false') + '" data-ss-tab="' + escapeHtml(tb.mode) + '">' + escapeHtml(tb.label) + '</button>').join('') + '</div>';
  if (D.cap) html += '<div class="bg-ss-cap">' + escapeHtml(D.cap) + '</div>';
  // ---- players ----
  let rows = (D.teams.length && !D.order.length) ? [] : M.rows.slice();
  if (game && rows.length) {
    rows.forEach(r => { const d = D.players[r.id]; r._g = d || null; const tot = d && d.cells.tot ? d.cells.tot.a : null;
      r._multi = !!(d && d.extras.length > 1);
      r._gTot = r._multi ? '' : (d && d.extras.length === 1 && d.extras[0].cells.tot && d.extras[0].cells.tot.a) || tot || '';
      r._in = !!(d && (r._multi || (r._gTot && !/^(—|–|·|no match)$/i.test(r._gTot))));
      r._gVal = r._multi ? Math.max.apply(null, d.extras.map(x => _bgSsRankVal(mode, x.cells.tot && x.cells.tot.a))) : _bgSsRankVal(mode, r._gTot); });
    const dom = {}; D.order.forEach((id, i) => { dom[id] = i; });
    if (mode === 'quota' || mode.indexOf('pt:') === 0) rows.sort((a, b) => (dom[a.id] == null ? 999 : dom[a.id]) - (dom[b.id] == null ? 999 : dom[b.id]));   // the classic card already put this tab 1st to last
    else rows.sort((a, b) => ((a._in ? 0 : 1) - (b._in ? 0 : 1)) || (b._gVal - a._gVal) || (a.order - b.order));
    rows.forEach((r, i) => { r._gRank = ''; if (!r._in) return; const f = r._g && r._g.foot[0] ? /^(T?\d+)(st|nd|rd|th)\b/.exec(r._g.foot[0]) : null;
      if (f) r._gRank = f[1]; else if (mode === 'units') { const first = rows.findIndex(x => x._in && x._gVal === r._gVal); const tied = rows.filter(x => x._in && x._gVal === r._gVal).length > 1; r._gRank = (tied ? 'T' : '') + (first + 1); } });
  }
  rows.forEach(r => {
    const open = !!_bgScStand.open[r.id];
    const strokeSub = !r.thru ? T('No scores yet') : (r.gross + ' ' + T('gross') + (M.net && r.net !== r.gross ? ' · ' + r.net + ' ' + T('net') : ''));
    const gd = game ? r._g : null;
    const gSub = !game ? '' : r._multi ? gd.extras.map(x => x.label + ' ' + ((x.cells.tot && x.cells.tot.a) || '')).join(' · ') : (gd && gd.foot[0]) || (r._in ? '' : T('Not in this game'));
    const big = !game ? r.big : r._multi ? gd.extras.length + ' ' + T('matches') : (r._in ? r._gTot : '—');
    html += '<div class="bg-ss-card' + (open ? ' bg-ss-open' : '') + '" data-ss-pid="' + escapeHtml(String(r.id)) + '">'
      + '<button type="button" class="bg-btn bg-ss-row" data-ss-toggle="' + escapeHtml(String(r.id)) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span class="bg-ss-rank">' + escapeHtml((game ? r._gRank : r.rank) || '') + '</span>' + bgScStandAvHtml(r)
      + '<span class="bg-ss-name">' + escapeHtml(r.name) + '</span>'
      + '<span class="bg-ss-big' + (String(big).length > 4 ? ' bg-ss-big-txt' : '') + (game ? ' ' + _bgSsGvCls(big) : '') + '">' + escapeHtml(String(big)) + '</span>'
      + '<span class="bg-ss-chev" aria-hidden="true">' + (open ? '▲' : '▼') + '</span>'
      + '<span class="bg-ss-meta">' + (r.hcpTxt ? '<span class="bg-ss-hcp">' + escapeHtml(r.hcpTxt === 'Gross' ? T('Gross') : r.hcpTxt) + '</span>' : '') + (r.thru ? '<span>' + T('thru') + ' ' + r.thru + '</span>' : '')
      + (!game && (r.skins || r.fskins) ? '<span class="bg-ss-skins">' + ((r.skins || 0) + (r.fskins || 0)) + ' ' + T(((r.skins || 0) + (r.fskins || 0)) === 1 ? 'skin' : 'skins') + '</span>' : '')
      + '<span class="bg-ss-sub' + (game ? ' bg-ss-sub-g' : '') + '">' + escapeHtml(game ? gSub : strokeSub) + '</span></span></button>';
    if (open) {
      M.nines.forEach(N => {
        let hn = '', pr = '', hc = '', sc = '', parT = 0;
        for (let i = N.from; i < N.from + 9; i++) {
          const c = r.holes[i] || {}; parT += (c.par || 0);
          hn += '<span class="bg-ss-hn">' + (i + 1) + '</span>';
          pr += '<span class="bg-ss-pr">' + (c.par == null ? '' : c.par) + '</span>';
          hc += '<span class="bg-ss-hc">' + (c.si == null ? '' : c.si) + '</span>';
          const d = (c.s == null || c.par == null) ? null : c.s - c.par;
          const cls = (c.skin && c.fskin) ? 'bg-ss-skin bg-ss-fskin' : c.fskin ? 'bg-ss-fskin' : c.skin ? 'bg-ss-skin' : d == null ? 'bg-ss-none' : d <= -2 ? 'bg-ss-eag' : d === -1 ? 'bg-ss-bir' : d === 0 ? 'bg-ss-par' : d === 1 ? 'bg-ss-bog' : 'bg-ss-dbl';
          sc += '<button type="button" class="bg-btn bg-ss-cell" data-ss-pid="' + escapeHtml(String(r.id)) + '" data-ss-hole="' + (i + 1) + '" aria-label="' + escapeHtml(r.name) + ', ' + T('Hole') + ' ' + (i + 1) + ': ' + (c.s == null ? T('no score') : c.s) + (c.skin || c.fskin ? ', ' + T('skin won') : '') + '">'
            + (c.st ? '<span class="bg-ss-dot" aria-hidden="true">' + (c.st > 1 ? '••' : '•') + '</span>' : '')
            + '<span class="bg-ss-mark ' + cls + (c.s != null && c.s >= 10 ? ' bg-ss-2d' : '') + '">' + (c.s == null ? '–' : c.s) + '</span>' + (c.pu ? '<span class="bg-ss-pu">PU</span>' : '') + '</button>';
        }
        const st = r.sub[N.lbl], sn = r.subNet ? r.subNet[N.lbl] : null, showNet = M.net && st != null && sn != null && sn !== st;
        let gl = '';
        if (gd) { if (gd.extras.length) gd.extras.forEach(x => { gl += '<div class="bg-ss-gcap">' + escapeHtml(gLab + ' ' + x.label) + '</div>' + _bgSsGameLine(x.cells, N, ''); }); else gl = _bgSsGameLine(gd.cells, N, gLab); }
        html += '<div class="bg-ss-nine">'
          + '<div class="bg-ss-line bg-ss-line-h"><span class="bg-ss-lab">' + T('Hole') + '</span>' + hn + '<span class="bg-ss-hn">' + N.lbl + '</span></div>'
          + '<div class="bg-ss-line"><span class="bg-ss-lab">' + T('Par') + '</span>' + pr + '<span class="bg-ss-pr">' + parT + '</span></div>'
          + (g.sis ? '<div class="bg-ss-line"><span class="bg-ss-lab">HCP</span>' + hc + '<span class="bg-ss-hc"></span></div>' : '')
          + '<div class="bg-ss-line bg-ss-line-s"><span class="bg-ss-lab">' + T('Score') + '</span>' + sc + '<span class="bg-ss-sum">' + (st == null ? '–' : st) + (showNet ? '<span class="bg-ss-net">' + sn + ' ' + T('net') + '</span>' : '') + '</span></div>' + gl + '</div>';
      });
      if (gd && (r._in)) html += '<div class="bg-ss-total bg-ss-gtotal"><span>' + escapeHtml(D.label.replace(/^[^\w']+/, '').trim()) + '</span>' + (r._multi ? gd.extras.map(x => '<span><b>' + escapeHtml((x.cells.tot && x.cells.tot.a) || '') + '</b> ' + escapeHtml(x.label) + '</span>').join('') : '<span><b>' + escapeHtml(r._gTot) + '</b></span>') + gd.foot.map(f => '<span class="bg-ss-foot">' + escapeHtml(f) + '</span>').join('') + '</div>';
      if (r.thru) html += '<div class="bg-ss-total"><span>' + T('Total') + '</span><span><b>' + r.gross + '</b> ' + T('gross') + '</span>' + (M.net && r.net !== r.gross ? '<span><b>' + r.net + '</b> ' + T('net') + '</span>' : '') + '<span><b>' + bgScStandToPar(M.net ? r.netPar : r.grossPar) + '</b> ' + (M.net ? T('net to par') : T('to par')) + '</span></div>';
      if (M.net && r.hcp) html += '<div class="bg-ss-note"><span class="bg-ss-dot" aria-hidden="true">•</span> ' + T('gets a stroke on that hole') + '</div>';
    }
    html += '</div>';
  });
  // ---- team cards: Scramble / Ryder Cup (one ball or one result per team), and the cart's best ball below the players ----
  const parOf = h => { const pr = D.head.find(x => /^par$/i.test(x.label)); const v = pr ? parseInt(pr.vals[h], 10) : NaN; return isFinite(v) ? v : (g.pars ? g.pars[h - 1] : null); };
  const teamCard = (E, id, members, kind) => {
    let gross = 0, par = 0, thru = 0; M.nines.forEach(N => { for (let i = N.from; i < N.from + 9; i++) { const c = E.cells[i + 1]; const s = c ? parseInt(c.o, 10) : NaN; const p = parOf(i + 1); if (isFinite(s) && p != null) { gross += s; par += p; thru++; } } });
    E._thru = thru; E._par = gross - par; E._gross = gross;
    const gTot = game && E.cells.tot && E.cells.tot.a != null ? E.cells.tot.a : '';
    const useG = game && kind !== 'bb' && gTot !== '';
    const big = useG ? gTot : (thru ? bgScStandToPar(E._par) : '—');
    const open = !!_bgScStand.open[id];
    const avs = members.length ? members.map(p => bgAvCircleHtml(p, 'bg-ss-av', 'bg-ss-av-photo', (bgScStandColors(g)[p.id] || null), false)).join('') : '<span class="bg-ss-av bg-ss-av-team" aria-hidden="true">' + escapeHtml((E.name || 'T').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'T') + '</span>';
    let h = '<div class="bg-ss-card bg-ss-team' + (kind === 'bb' ? ' bg-ss-bb' : '') + (open ? ' bg-ss-open' : '') + '" data-ss-team="' + escapeHtml(id) + '">'
      + '<button type="button" class="bg-btn bg-ss-row" data-ss-toggle="' + escapeHtml(id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span class="bg-ss-rank">' + escapeHtml(E._rank || '') + '</span><span class="bg-ss-avs">' + avs + '</span>'
      + '<span class="bg-ss-name">' + escapeHtml(E.name || T('Team')) + '</span>'
      + '<span class="bg-ss-big' + (String(big).length > 4 ? ' bg-ss-big-txt' : '') + (useG ? ' ' + _bgSsGvCls(big) : '') + '">' + escapeHtml(String(big)) + '</span>'
      + '<span class="bg-ss-chev" aria-hidden="true">' + (open ? '▲' : '▼') + '</span>'
      + '<span class="bg-ss-meta">' + (kind === 'bb' ? '<span class="bg-ss-hcp">' + escapeHtml(E.sub || T('best ball')) + '</span>' : '<span class="bg-ss-hcp">' + T('Team') + '</span>') + (thru ? '<span>' + T('thru') + ' ' + thru + '</span>' : '')
      + '<span class="bg-ss-sub">' + (thru ? gross + (useG ? ' · ' + bgScStandToPar(E._par) : '') : escapeHtml(T('No scores yet'))) + '</span></span></button>';
    if (open) {
      M.nines.forEach(N => {
        let hn = '', sc = '', sum = 0, any = false; const extra = D.head.map(() => '');
        for (let i = N.from; i < N.from + 9; i++) {
          hn += '<span class="bg-ss-hn">' + (i + 1) + '</span>';
          D.head.forEach((H, k) => { extra[k] += '<span class="' + (/^par$/i.test(H.label) ? 'bg-ss-pr' : 'bg-ss-hc') + '">' + escapeHtml(H.vals[i + 1] || '') + '</span>'; });
          const c = E.cells[i + 1]; const s = c ? parseInt(c.o, 10) : NaN; const p = parOf(i + 1); const d = (isFinite(s) && p != null) ? s - p : null; if (isFinite(s)) { sum += s; any = true; }
          const cls = d == null ? 'bg-ss-none' : d <= -2 ? 'bg-ss-eag' : d === -1 ? 'bg-ss-bir' : d === 0 ? 'bg-ss-par' : d === 1 ? 'bg-ss-bog' : 'bg-ss-dbl';
          sc += '<span class="bg-ss-cell bg-ss-cell-ro"><span class="bg-ss-mark ' + cls + (isFinite(s) && s >= 10 ? ' bg-ss-2d' : '') + '">' + (isFinite(s) ? s : '–') + '</span></span>';
        }
        const ek = N.lbl === 'OUT' ? 'out' : 'in';
        h += '<div class="bg-ss-nine"><div class="bg-ss-line bg-ss-line-h"><span class="bg-ss-lab">' + T('Hole') + '</span>' + hn + '<span class="bg-ss-hn">' + N.lbl + '</span></div>'
          + D.head.map((H, k) => '<div class="bg-ss-line"><span class="bg-ss-lab">' + escapeHtml(H.hcp ? 'HCP' : H.label.length > 6 ? H.label.slice(0, 5) + '.' : H.label) + '</span>' + extra[k] + '<span class="' + (/^par$/i.test(H.label) ? 'bg-ss-pr' : 'bg-ss-hc') + '">' + escapeHtml(/^par$/i.test(H.label) ? (H.vals[ek] || '') : '') + '</span></div>').join('')
          + '<div class="bg-ss-line bg-ss-line-s"><span class="bg-ss-lab">' + T('Score') + '</span>' + sc + '<span class="bg-ss-sum">' + (any ? sum : '–') + '</span></div>'
          + (useG || (game && kind !== 'bb' && E.cells[N.from + 1] && E.cells[N.from + 1].a != null) ? _bgSsGameLine(E.cells, N, gLab) : '') + '</div>';
      });
      if (thru) h += '<div class="bg-ss-total"><span>' + T('Total') + '</span><span><b>' + gross + '</b></span><span><b>' + bgScStandToPar(E._par) + '</b> ' + T('to par') + '</span>' + (useG ? '<span><b>' + escapeHtml(gTot) + '</b> ' + escapeHtml(gLab) + '</span>' : '') + '</div>';
    }
    return h + '</div>';
  };
  const idsFor = (E, i) => { try { const gm = g.games || {}; const cfg = gm.scramble || gm.ryderCup || {}; let ids = (E.team && Array.isArray(cfg[E.team])) ? cfg[E.team] : (i === 0 ? cfg.teamA : i === 1 ? cfg.teamB : null); if (!Array.isArray(ids) && cfg.teams && E.team && Array.isArray(cfg.teams[E.team])) ids = cfg.teams[E.team]; return (ids || []).map(id => (g.players || []).find(p => p && p.id === id)).filter(Boolean); } catch (e) { return []; } };
  if (D.teams.length) {
    const TT = D.teams.map((E, i) => ({ E: E, id: 'T:' + i, mem: idsFor(E, i) }));
    TT.forEach(x => { let gr = 0, pa = 0, th = 0; for (let hN = 1; hN <= 18; hN++) { const c = x.E.cells[hN]; const s = c ? parseInt(c.o, 10) : NaN; const p = parOf(hN); if (isFinite(s) && p != null) { gr += s; pa += p; th++; } } x.v = th ? gr - pa : null; });
    const ord = TT.slice().sort((a, b) => ((a.v == null ? 1 : 0) - (b.v == null ? 1 : 0)) || ((a.v || 0) - (b.v || 0)));
    ord.forEach(x => { if (x.v == null) { x.E._rank = ''; return; } const first = ord.findIndex(y => y.v === x.v); const tied = ord.filter(y => y.v === x.v).length > 1; x.E._rank = (tied ? 'T' : '') + (first + 1); });
    (game ? TT : ord).forEach(x => { html += teamCard(x.E, x.id, x.mem, 'team'); });
  }
  D.bb.forEach((E, i) => { let mem = []; try { const c = g.games && g.games.teamLowball; if (i === 0 && c && c.teamMode === '4man' && Array.isArray(c.teamA)) mem = c.teamA.map(id => (g.players || []).find(p => p && p.id === id)).filter(Boolean).slice(0, 4); } catch (e) {} html += teamCard(E, 'BB:' + i, mem, 'bb'); });
  if (D.bands.length) html += '<div class="bg-ss-bands">' + D.bands.map(x => '<div>' + escapeHtml(x) + '</div>').join('') + '</div>';
  html += '<div class="bg-ss-key"><span><span class="bg-ss-mark bg-ss-bir bg-ss-k" aria-hidden="true"></span>' + T('Birdie') + '</span><span><span class="bg-ss-mark bg-ss-bog bg-ss-k" aria-hidden="true"></span>' + T('Bogey') + '</span><span><span class="bg-ss-mark bg-ss-dbl bg-ss-k" aria-hidden="true"></span>' + T('Double +') + '</span>' + (M.skin && rows.length ? '<span><span class="bg-ss-mark bg-ss-skin bg-ss-k" aria-hidden="true"></span>' + T(M.fskin ? 'Group skin' : 'Skin') + '</span>' : '') + (M.fskin && rows.length ? '<span><span class="bg-ss-mark bg-ss-fskin bg-ss-k" aria-hidden="true"></span>' + T('Event skin') + '</span>' : '') + '</div>';
  return html;
}
function bgScStandPaint(g) {
  try {
    const sec = document.getElementById('score-tab-scorecard-section'), box = document.getElementById('bg-sc-stand'), sw = document.getElementById('bg-sc-stand-switch'), help = document.getElementById('bg-sc-stand-help');
    if (!sec || !box) return;
    const TT = (typeof bgT === 'function') ? bgT : (x => x);
    const D = bgScStandDom(g);
    const teamOnly = D.teams.length > 0 && !D.order.length;
    const ok = bgScStandOk(g) && (D.order.length > 0 || D.teams.length > 0), stand = ok && bgScStandMode() === 'stand';
    sec.classList.toggle('bg-sc-mode-stand', stand);
    if (sw) { sw.style.display = ok ? '' : 'none'; sw.textContent = TT(stand ? 'Classic scorecard' : 'New scorecard'); sw.onclick = function () { bgScStandSetMode(stand ? 'classic' : 'stand'); }; }
    if (!stand) { box.innerHTML = ''; if (help) help.textContent = TT('Tap any score to fix it.'); return; }
    if (help) help.textContent = teamOnly ? TT('Tap a team to open its card.') : TT('Tap a player to open his card. Tap any score to fix it.');
    const M = bgScStandModel(g);
    const code = String(g.code || '');
    // First look (Tyler): YOUR card is open, everyone else is collapsed. Until the app knows which player you are,
    // everyone is collapsed; once you open or close a card yourself, it is left alone. In a team round it is your team's card.
    if (!_bgScStand.seeded[code]) {
      let me = null; try { me = (typeof gpsResolveMyId === 'function') ? gpsResolveMyId(g) : null; } catch (e) { me = null; }
      _bgScStand.open = {};
      if (me != null && M.rows.some(r => r.id === me)) {
        if (teamOnly) { try { const cfg = (g.games && (g.games.scramble || g.games.ryderCup)) || {}; D.teams.forEach((E, i) => { const ids = (E.team && Array.isArray(cfg[E.team])) ? cfg[E.team] : (i === 0 ? cfg.teamA : i === 1 ? cfg.teamB : null); if (Array.isArray(ids) && ids.indexOf(me) >= 0) _bgScStand.open['T:' + i] = 1; }); } catch (e) {} }
        else _bgScStand.open[me] = 1;
        _bgScStand.seeded[code] = 1;
      }
    }
    box.innerHTML = bgScStandHtml(g, M, D);
    // Tournament whole-field skins need every group's scores: fetched (cached 20 s by the app), then one repaint if they changed.
    try {
      if (g.t2 && g.t2.tournamentId && typeof _t2FetchFieldSkinMap === 'function') {
        Promise.resolve(_t2FetchFieldSkinMap(g)).then(function (map) {
          try { const sig = JSON.stringify(map || {}); if (_bgScStand.fieldSig[code] === sig) return; _bgScStand.fieldSig[code] = sig; _bgScStand.field[code] = map || {}; if (state.game && String(state.game.code || '') === code) bgScStandPaint(state.game); } catch (e) {}
        }).catch(function () {});
      }
    } catch (e) {}
    box.onclick = function (ev) {
      try {
        const t = ev.target && ev.target.closest ? ev.target : null; if (!t) return;
        const tab = t.closest('[data-ss-tab]');
        if (tab) {   // the classic card's own tab switch does the work (it remembers the choice and moves every card of this round)
          const tbl = document.getElementById('scorecard-score-tab'); const cb = tbl && Array.from(tbl.querySelectorAll('caption .sc-tab')).find(b => b.dataset.mode === tab.dataset.ssTab);
          if (cb && typeof bgScTab === 'function') bgScTab(null, cb);
          bgScStandPaint(state.game); return;
        }
        const cell = t.closest('[data-ss-hole]');
        if (cell) { if (state.viewOnlyMode) return; bgOpenHoleScoreEdit(cell.dataset.ssPid, Number(cell.dataset.ssHole)); return; }
        const tg = t.closest('[data-ss-toggle]');
        if (tg) { const id = tg.dataset.ssToggle; _bgScStand.seeded[String((state.game && state.game.code) || '')] = 1; if (_bgScStand.open[id]) delete _bgScStand.open[id]; else _bgScStand.open[id] = 1; bgScStandPaint(state.game); }
      } catch (e) {}
    };
  } catch (e) {}
}
"""

CSS = """  /* v2089: tabs, game lines and team cards on the new scorecard */
  .bg-ss-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  #bg-sc-stand .bg-ss-tab { min-height: 44px; padding-left: 14px; padding-right: 14px; font-size: 15px; font-weight: 700; }
  #bg-sc-stand .bg-ss-tab.is-on { background: var(--bg-brand) !important; border-color: var(--bg-brand) !important; color: #fff !important; }
  .bg-ss-cap { font-size: 14px; line-height: 1.35; color: var(--bg-text-muted); padding: 0 2px; }
  .bg-ss-big.bg-ss-big-txt { font-size: 18px; white-space: normal; text-align: right; max-width: 112px; line-height: 1.15; }
  .bg-ss-big.bg-ss-gv-up { color: var(--score-good); } .bg-ss-big.bg-ss-gv-dn { color: var(--score-bad); }
  .bg-ss-sub.bg-ss-sub-g { white-space: normal; text-align: right; }
  .bg-ss-line-g { min-height: 34px; border-top: 1px dashed var(--bg-border); }
  .bg-ss-gv { font-size: 14px; font-weight: 800; color: var(--bg-text); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .bg-ss-gv.bg-ss-gv-up { color: var(--score-good); } .bg-ss-gv.bg-ss-gv-dn { color: var(--score-bad); } .bg-ss-gv.bg-ss-gv-none { color: var(--bg-text-muted); font-weight: 600; }
  .bg-ss-gv.bg-ss-gv-toss { text-decoration: line-through; opacity: 0.6; font-weight: 600; }
  .bg-ss-gv.bg-ss-gsum { font-size: 15px; }
  .bg-ss-gcap { font-size: 13px; font-weight: 800; color: var(--accent); padding: 6px 2px 0; border-top: 1px dashed var(--bg-border); }
  .bg-ss-gcap + .bg-ss-line-g { border-top: 0; }
  .bg-ss-total.bg-ss-gtotal > span:first-child { color: var(--accent); }
  .bg-ss-total .bg-ss-foot { flex-basis: 100%; font-size: 14px; }
  .bg-ss-avs { display: flex; flex-shrink: 0; }
  .bg-ss-avs .bg-ss-av { width: 38px; height: 38px; font-size: 14px; box-shadow: 0 0 0 2px var(--bg-surface); }
  .bg-ss-avs .bg-ss-av + .bg-ss-av { margin-left: -8px; }
  .bg-ss-avs .bg-ss-av:nth-child(n+3) { margin-left: -14px; }
  .bg-ss-av.bg-ss-av-team { background: var(--bg-brand-dark); }
  .bg-ss-card.bg-ss-bb { border-style: dashed; }
  .bg-ss-team .bg-ss-name { font-size: 17px; overflow-wrap: break-word; }
  .bg-ss-team .bg-ss-big.bg-ss-big-txt { max-width: 96px; }
  .bg-ss-cell.bg-ss-cell-ro { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; }
  .bg-ss-bands { background: var(--bg-surface); border: 1px solid var(--bg-border); border-radius: 14px; padding: 10px 12px; font-size: 14px; line-height: 1.4; color: var(--bg-text); display: flex; flex-direction: column; gap: 4px; }
  @media (max-width: 374px) { .bg-ss-gv { font-size: 12px; } .bg-ss-avs .bg-ss-av { width: 32px; height: 32px; font-size: 12px; } .bg-ss-big.bg-ss-big-txt { font-size: 16px; max-width: 92px; } }
"""

def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    a = src.index("function bgScStandHtml(g, M) {\n"); b = src.index("function renderScoreEntry() {\n")
    assert src.count("function bgScStandHtml(g, M) {\n") == 1 and 0 < b - a < 16000, (path, 'stand slice', b - a)
    src = src[:a] + JS + src[b:]; n[0] += 1
    one('ok', "function bgScStandOk(g) { try { return !!(g && Array.isArray(g.players) && g.players.length && Array.isArray(g.pars) && !(g.games && (g.games.scramble || g.games.ryderCup))); } catch (e) { return false; } }",
        "function bgScStandOk(g) { try { return !!(g && Array.isArray(g.players) && g.players.length && Array.isArray(g.pars)); } catch (e) { return false; } }   // v2089: team rounds too (one card per team)")
    one('css', "  /* v2086: the 11's card on the score screen */\n", CSS + "  /* v2086: the 11's card on the score screen */\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
