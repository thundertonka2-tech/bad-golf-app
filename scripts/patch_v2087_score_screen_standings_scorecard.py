#!/usr/bin/env python3
# v2026.11.2087 -- Tyler, 11/27: "The one thing I really don't like about our scorecard is its hard to read the
# names and scores. Especially if someone has a longer name or if we have two players with the same first name ...
# make everything bigger." He picked mockup D (standings first, tap a player to open his card), and:
#   - same first name -> last initial; "make sure ... the colors on their circles are different"
#   - "Just the scoring screen only"
#   - "Have an option to show the old scorecard ... HCP is very important, we need to find a way to show it"
#   - "Make sure on this new score card that I can click any hole and change my score when needed just like the old one."
# The classic table is still rendered (hidden) so every tab / tap handler it has keeps working when switched back.
import sys, io
OLD_V, NEW_V = 'v2026.11.2086', 'v2026.11.2087'

JS = r"""
/* ============================================================================
   v2087 (Tyler, 11/27): the Score screen's scorecard, standings first.
   One big row per player (photo / initials circle, name, HCP, to par, gross / net); your own card starts
   open and everyone else's collapsed; tap a row to open
   his card: both nines with hole, par, HCP (stroke index) and his scores, a dot on every hole he gets a
   stroke. Tap any score to fix it (same editor as the classic card). "Classic scorecard" brings the old
   table back (yardage, Match / Units / Quota / 11's tabs); the choice is remembered on the phone.
   ============================================================================ */
var _bgScStand = { open: {}, seeded: {}, field: {}, fieldSig: {} };
function bgScStandMode() { try { return localStorage.getItem('bg_sc_view') === 'classic' ? 'classic' : 'stand'; } catch (e) { return 'stand'; } }
function bgScStandSetMode(m) {
  try { localStorage.setItem('bg_sc_view', m === 'classic' ? 'classic' : 'stand'); } catch (e) {}
  try { if (state && state.game) bgScStandPaint(state.game); } catch (e) {}
}
// Rounds the new card does not draw (one ball per team): they stay on the classic card.
function bgScStandOk(g) { try { return !!(g && Array.isArray(g.players) && g.players.length && Array.isArray(g.pars) && !(g.games && (g.games.scramble || g.games.ryderCup))); } catch (e) { return false; } }
// A colour per player that is never shared inside the group (Tyler: two Kevins must not get the same circle).
function bgScStandColors(g) {
  const out = {};
  try {
    const pal = ['#b5602b', '#0f7d86', '#7a4fb5', '#1f8a3b', '#a1391f', '#3a6ea5', '#7a1f5a', '#8a5a1f', '#4a4fb5', '#2b7a4b', '#0c447c', '#a0527a'];
    const used = {};
    (g.players || []).forEach(p => {
      if (!p) return;
      const key = String(p.id || p.name || '');
      let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      let k = h % pal.length, n = 0;
      while (used[k] && n < pal.length) { k = (k + 1) % pal.length; n++; }
      used[k] = 1; out[p.id] = pal[k];
    });
  } catch (e) {}
  return out;
}
function bgScStandToPar(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : '−' + Math.abs(n)); }
// Everything the card shows, in one place (pure: no DOM), so it can be tested on its own.
function bgScStandModel(g) {
  const M = { rows: [], nines: [], net: false, holes: 18 };
  try {
    const n = (typeof roundHoles === 'function') ? (roundHoles(g) || 18) : 18;
    const back = (typeof bgIsBackNineRound === 'function') && bgIsBackNineRound(g);
    M.holes = n;
    M.nines = (n === 9) ? [back ? { lbl: 'IN', from: 9 } : { lbl: 'OUT', from: 0 }] : [{ lbl: 'OUT', from: 0 }, { lbl: 'IN', from: 9 }];
    const idxs = []; M.nines.forEach(N => { for (let i = N.from; i < N.from + 9; i++) idxs.push(i); });
    const noH = !!(g.hcpRules && g.hcpRules.noHandicaps);
    const cols = bgScStandColors(g);
    // skins won: this group's own game (any round - casual, league, tournament cart) and the tournament's whole-field skins
    let skin = {}, fskin = {}; try { skin = (typeof skinWinnersByHole === 'function') ? (skinWinnersByHole(g) || {}) : {}; } catch (e) { skin = {}; }
    try { fskin = _bgScStand.field[String(g.code || '')] || {}; } catch (e) { fskin = {}; }
    (g.players || []).forEach((p, order) => {
      if (!p) return;
      const arr = (g.scores && g.scores[p.id]) || [];
      const gross = p.playsGross === true || noH || !g.sis;
      const hcp = gross ? null : Math.round(Number((typeof effectiveHcp === 'function') ? effectiveHcp(p, g.hcpRules) : (p.hcp || 0)) || 0);
      const R = { p: p, id: p.id, order: order, name: (typeof displayFirst === 'function') ? displayFirst(p, g.players) : (p.name || '?'), color: cols[p.id] || 'var(--accent)',
        hcp: hcp, hcpTxt: noH ? '' : (p.playsGross === true ? 'Gross' : 'HCP ' + (hcp == null ? 0 : hcp)), thru: 0, gross: 0, net: 0, parSum: 0, holes: {}, sub: {} };
      idxs.forEach(i => {
        let par = null, si = null, st = 0;
        try { par = (typeof parFor === 'function') ? parFor(g, p.id, i) : g.pars[i]; } catch (e) { par = g.pars[i]; }
        try { si = g.sis ? ((typeof siFor === 'function') ? siFor(g, p.id, i) : g.sis[i]) : null; } catch (e) { si = null; }
        try { st = (!gross && si != null) ? (strokesOnHole(effectiveHcp(p, g.hcpRules), si, par, g.hcpRules) || 0) : 0; } catch (e) { st = 0; }
        const s = arr[i];
        let ns = s;
        try { if (s != null && !gross && si != null && typeof netHoleScore === 'function') ns = netHoleScore(s, effectiveHcp(p, g.hcpRules), si, par, g.hcpRules); } catch (e) { ns = s; }
        R.holes[i] = { skin: !!(s != null && skin[i] && skin[i][p.id]), fskin: !!(s != null && fskin[i] && fskin[i][p.id]), par: par, si: si, st: st, s: (s == null ? null : s), ns: (s == null ? null : ns), pu: (typeof bgIsPickedUp === 'function') ? !!bgIsPickedUp(g, p.id, i) : false };
        if (R.holes[i].skin) { R.skins = (R.skins || 0) + 1; M.skin = true; } if (R.holes[i].fskin) { R.fskins = (R.fskins || 0) + 1; M.fskin = true; }
        if (s != null && par != null) { R.thru++; R.gross += s; R.net += ns; R.parSum += par; if (st) M.net = true; }
      });
      M.nines.forEach(N => { let a = 0, any = false; for (let i = N.from; i < N.from + 9; i++) { const c = R.holes[i]; if (c && c.s != null) { a += c.s; any = true; } } R.sub[N.lbl] = any ? a : null; });
      R.subNet = {}; M.nines.forEach(N => { let a = 0, any = false; for (let i = N.from; i < N.from + 9; i++) { const c = R.holes[i]; if (c && c.s != null) { a += (c.ns == null ? c.s : c.ns); any = true; } } R.subNet[N.lbl] = any ? a : null; });
      if (hcp) M.net = true;
      R.grossPar = R.gross - R.parSum; R.netPar = R.net - R.parSum;
      M.rows.push(R);
    });
    // Rank: net to par when anyone gets strokes, gross otherwise; a player with no score sits at the bottom in card order.
    const val = r => (M.net ? r.netPar : r.grossPar);
    M.rows.sort((a, b) => ((a.thru ? 0 : 1) - (b.thru ? 0 : 1)) || (a.thru ? (val(a) - val(b)) : 0) || (a.order - b.order));
    let prev = null, place = 0;
    M.rows.forEach((r, i) => { if (!r.thru) { r.rank = ''; return; } if (prev == null || val(r) !== prev) { place = i + 1; prev = val(r); } r.place = place; });
    M.rows.forEach(r => { if (!r.thru) return; const tied = M.rows.filter(x => x.thru && x.place === r.place).length > 1; r.rank = (tied ? 'T' : '') + r.place; });
    M.rows.forEach(r => { r.big = r.thru ? bgScStandToPar(val(r)) : '—'; });
  } catch (e) {}
  return M;
}
// One avatar circle for the new cards: the profile photo, else initials on the player's colour.
// A photo that fails to load, or is a blank square (the Apple review account's picture is solid black, which showed
// as an empty black circle on the 11's card - Tyler 11/27), falls back to the initials.
var _bgAvBlank = {};
function _bgAvKey(src) { try { const s = String(src || ''); return s.length + ':' + s.slice(-48); } catch (e) { return ''; } }
function bgAvToInitials(img) {
  try {
    const w = img && img.parentElement; if (!w) return;
    _bgAvBlank[_bgAvKey(img.getAttribute('src'))] = 1;
    w.classList.remove('bg-el-av-photo', 'bg-ss-av-photo'); w.style.boxShadow = ''; w.style.background = w.dataset.avColor || 'var(--accent)'; w.textContent = w.dataset.avIni || '?';
  } catch (e) {}
}
function bgAvBlankCheck(img) {
  try {
    const c = document.createElement('canvas'); c.width = 12; c.height = 12;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 12, 12);
    const d = x.getImageData(0, 0, 12, 12).data;   // throws on a cross-origin picture: then it is left alone
    let mn = 255, mx = 0, a = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10; if (l < mn) mn = l; if (l > mx) mx = l; a += d[i + 3]; }
    if ((mx - mn) < 14 || a < 255 * 144 * 0.15) bgAvToInitials(img);   // one flat colour, or (nearly) fully transparent
  } catch (e) {}
}
function bgAvCircleHtml(p, cls, photoCls, color, labelled) {
  try {
    const nm = (p && (p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim())) || '';
    let av = (p && p.avatar && typeof _bgSafeAvatarUrl === 'function') ? _bgSafeAvatarUrl(p.avatar) : '';
    if (!av && typeof bgAvatarForName === 'function') av = bgAvatarForName(nm) || '';
    if (av && _bgAvBlank[_bgAvKey(av)]) av = '';
    const col = color || (typeof _bgAvatarColor === 'function' ? _bgAvatarColor(p) : 'var(--accent)');
    const ini = escapeHtml((typeof displayInitials === 'function' ? displayInitials(p) : '') || '?');
    const lbl = escapeHtml(typeof displayFirst === 'function' ? displayFirst(p) : nm);
    const acc = labelled ? ' role="img" aria-label="' + lbl + '" title="' + lbl + '"' : ' aria-hidden="true"';
    const data = ' data-av-ini="' + ini + '" data-av-color="' + escapeHtml(col) + '"';
    if (av) return '<span class="' + cls + ' ' + photoCls + '"' + acc + data + '><img src="' + escapeHtml(av) + '" alt="" onload="bgAvBlankCheck(this)" onerror="bgAvToInitials(this)"></span>';
    return '<span class="' + cls + '"' + acc + data + ' style="background:' + col + '">' + ini + '</span>';
  } catch (e) { return '<span class="' + cls + '" aria-hidden="true">?</span>'; }
}
function bgScStandAvHtml(r) { return bgAvCircleHtml(r.p, 'bg-ss-av', 'bg-ss-av-photo', r.color, false); }
function bgScStandHtml(g, M) {
  const T = s => { try { return (typeof bgT === 'function') ? bgT(s) : s; } catch (e) { return s; } };
  let html = '';
  M.rows.forEach(r => {
    const open = !!_bgScStand.open[r.id];
    const sub = !r.thru ? T('No scores yet') : (r.gross + ' ' + T('gross') + (M.net && r.net !== r.gross ? ' · ' + r.net + ' ' + T('net') : ''));
    html += '<div class="bg-ss-card' + (open ? ' bg-ss-open' : '') + '" data-ss-pid="' + escapeHtml(String(r.id)) + '">'
      + '<button type="button" class="bg-btn bg-ss-row" data-ss-toggle="' + escapeHtml(String(r.id)) + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span class="bg-ss-rank">' + escapeHtml(r.rank || '') + '</span>' + bgScStandAvHtml(r)
      + '<span class="bg-ss-name">' + escapeHtml(r.name) + '</span>'
      + '<span class="bg-ss-big">' + r.big + '</span>'
      + '<span class="bg-ss-chev" aria-hidden="true">' + (open ? '▲' : '▼') + '</span>'
      + '<span class="bg-ss-meta">' + (r.hcpTxt ? '<span class="bg-ss-hcp">' + escapeHtml(r.hcpTxt === 'Gross' ? T('Gross') : r.hcpTxt) + '</span>' : '') + (r.thru ? '<span>' + T('thru') + ' ' + r.thru + '</span>' : '') + ((r.skins || r.fskins) ? '<span class="bg-ss-skins">' + ((r.skins || 0) + (r.fskins || 0)) + ' ' + T(((r.skins || 0) + (r.fskins || 0)) === 1 ? 'skin' : 'skins') + '</span>' : '') + '<span class="bg-ss-sub">' + escapeHtml(sub) + '</span></span></button>';
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
        html += '<div class="bg-ss-nine">'
          + '<div class="bg-ss-line bg-ss-line-h"><span class="bg-ss-lab">' + T('Hole') + '</span>' + hn + '<span class="bg-ss-hn">' + N.lbl + '</span></div>'
          + '<div class="bg-ss-line"><span class="bg-ss-lab">' + T('Par') + '</span>' + pr + '<span class="bg-ss-pr">' + parT + '</span></div>'
          + (g.sis ? '<div class="bg-ss-line"><span class="bg-ss-lab">HCP</span>' + hc + '<span class="bg-ss-hc"></span></div>' : '')
          + '<div class="bg-ss-line bg-ss-line-s"><span class="bg-ss-lab">' + T('Score') + '</span>' + sc + '<span class="bg-ss-sum">' + (st == null ? '–' : st) + (showNet ? '<span class="bg-ss-net">' + sn + ' ' + T('net') + '</span>' : '') + '</span></div></div>';
      });
      if (r.thru) html += '<div class="bg-ss-total"><span>' + T('Total') + '</span><span><b>' + r.gross + '</b> ' + T('gross') + '</span>' + (M.net && r.net !== r.gross ? '<span><b>' + r.net + '</b> ' + T('net') + '</span>' : '') + '<span><b>' + bgScStandToPar(M.net ? r.netPar : r.grossPar) + '</b> ' + (M.net ? T('net to par') : T('to par')) + '</span></div>';
      if (M.net && r.hcp) html += '<div class="bg-ss-note"><span class="bg-ss-dot" aria-hidden="true">•</span> ' + T('gets a stroke on that hole') + '</div>';
    }
    html += '</div>';
  });
  html += '<div class="bg-ss-key"><span><span class="bg-ss-mark bg-ss-bir bg-ss-k" aria-hidden="true"></span>' + T('Birdie') + '</span><span><span class="bg-ss-mark bg-ss-bog bg-ss-k" aria-hidden="true"></span>' + T('Bogey') + '</span><span><span class="bg-ss-mark bg-ss-dbl bg-ss-k" aria-hidden="true"></span>' + T('Double +') + '</span>' + (M.skin ? '<span><span class="bg-ss-mark bg-ss-skin bg-ss-k" aria-hidden="true"></span>' + T(M.fskin ? 'Group skin' : 'Skin') + '</span>' : '') + (M.fskin ? '<span><span class="bg-ss-mark bg-ss-fskin bg-ss-k" aria-hidden="true"></span>' + T('Event skin') + '</span>' : '') + '</div>';
  return html;
}
function bgScStandPaint(g) {
  try {
    const sec = document.getElementById('score-tab-scorecard-section'), box = document.getElementById('bg-sc-stand'), sw = document.getElementById('bg-sc-stand-switch'), help = document.getElementById('bg-sc-stand-help');
    if (!sec || !box) return;
    const ok = bgScStandOk(g), stand = ok && bgScStandMode() === 'stand';
    sec.classList.toggle('bg-sc-mode-stand', stand);
    if (sw) { sw.style.display = ok ? '' : 'none'; sw.textContent = (typeof bgT === 'function' ? bgT : (x => x))(stand ? 'Classic scorecard' : 'New scorecard'); sw.onclick = function () { bgScStandSetMode(stand ? 'classic' : 'stand'); }; }
    if (!stand) { box.innerHTML = ''; if (help) help.textContent = (typeof bgT === 'function' ? bgT : (x => x))('Tap any score to fix it.'); return; }
    if (help) help.textContent = (typeof bgT === 'function' ? bgT : (x => x))('Tap a player to open his card. Tap any score to fix it.');
    const M = bgScStandModel(g);
    const code = String(g.code || '');
    // First look (Tyler): YOUR card is open, everyone else is collapsed. Until the app knows which player you are,
    // everyone is collapsed; once you open or close a card yourself, it is left alone.
    if (!_bgScStand.seeded[code]) {
      let me = null; try { me = (typeof gpsResolveMyId === 'function') ? gpsResolveMyId(g) : null; } catch (e) { me = null; }
      _bgScStand.open = {};
      if (me != null && M.rows.some(r => r.id === me)) { _bgScStand.open[me] = 1; _bgScStand.seeded[code] = 1; }
    }
    box.innerHTML = bgScStandHtml(g, M);
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
        const cell = t.closest('[data-ss-hole]');
        if (cell) { if (state.viewOnlyMode) return; bgOpenHoleScoreEdit(cell.dataset.ssPid, Number(cell.dataset.ssHole)); return; }
        const tg = t.closest('[data-ss-toggle]');
        if (tg) { const id = tg.dataset.ssToggle; _bgScStand.seeded[String((state.game && state.game.code) || '')] = 1; if (_bgScStand.open[id]) delete _bgScStand.open[id]; else _bgScStand.open[id] = 1; bgScStandPaint(state.game); }
      } catch (e) {}
    };
  } catch (e) {}
}
"""

CSS = """  /* v2087: the Score screen's scorecard, standings first */
  #score-tab-scorecard-section.bg-sc-mode-stand .scorecard-wrap, #score-tab-scorecard-section.bg-sc-mode-stand #scorecard-score-tab-legend { display: none !important; }
  .bg-ss-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
  .bg-ss-top .help-text { margin: 0; flex: 1 1 180px; font-size: 14px; }
  #bg-sc-stand { display: flex; flex-direction: column; gap: 10px; }
  .bg-ss-card { background: var(--bg-surface); border: 1px solid var(--bg-border); border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
  .bg-ss-card.bg-ss-open { border-color: var(--bg-brand); }
  #bg-sc-stand .bg-ss-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto auto; align-items: center; column-gap: 10px; row-gap: 8px; width: 100%; min-height: 68px; padding: 10px 12px; margin: 0; background: transparent; border: 0; border-radius: 0; text-align: left; color: var(--bg-text); font-weight: 400; box-shadow: none; }
  .bg-ss-rank { min-width: 26px; text-align: center; font-size: 17px; font-weight: 800; color: var(--bg-text-muted); flex-shrink: 0; }
  .bg-ss-av { width: 46px; height: 46px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 17px; overflow: hidden; flex-shrink: 0; }
  .bg-ss-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bg-ss-name { font-size: 20px; font-weight: 800; line-height: 1.15; color: var(--bg-text); overflow-wrap: anywhere; }
  .bg-ss-big { font-size: 28px; font-weight: 800; line-height: 1; color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bg-ss-chev { font-size: 11px; color: var(--bg-text-muted); }
  .bg-ss-meta { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; font-size: 15px; color: var(--bg-text-muted); }
  .bg-ss-hcp { font-size: 15px; font-weight: 800; color: var(--bg-brand-dark); background: var(--bg-brand-tint); border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
  .bg-ss-sub { white-space: nowrap; margin-left: auto; color: var(--bg-text); font-weight: 600; }
  .bg-ss-nine { padding: 4px 8px 8px; border-top: 1px solid var(--bg-border); }
  .bg-ss-line { display: grid; grid-template-columns: 38px repeat(9, minmax(0, 1fr)) minmax(0, 1.5fr); align-items: center; justify-items: center; min-height: 26px; }
  .bg-ss-lab { justify-self: start; font-size: 12px; font-weight: 700; color: var(--bg-text-muted); white-space: nowrap; }
  .bg-ss-hn { font-size: 15px; font-weight: 800; color: var(--bg-text); }
  .bg-ss-pr { font-size: 15px; font-weight: 700; color: var(--accent); }
  .bg-ss-hc { font-size: 14px; font-weight: 600; color: var(--bg-text-muted); }
  .bg-ss-line-s { min-height: 50px; }
  #bg-sc-stand .bg-ss-cell { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; min-width: 0; min-height: 48px; padding: 0; margin: 0; background: transparent; border: 0; border-radius: 8px; box-shadow: none; color: var(--bg-text); }
  .bg-ss-mark { display: inline-flex; align-items: center; justify-content: center; width: 27px; height: 27px; max-width: 100%; box-sizing: border-box; font-size: 19px; font-weight: 800; line-height: 1; border: 2px solid transparent; border-radius: 6px; color: var(--bg-text); font-variant-numeric: tabular-nums; }
  .bg-ss-mark.bg-ss-2d { font-size: 15px; letter-spacing: -0.5px; }
  #bg-sc-stand-switch { min-height: 44px; }
  .bg-el-brows { margin-top: 6px; }
  .bg-el-brows .bg-el-brow { min-height: 54px; padding: 7px 0; flex-wrap: nowrap; }
  .bg-el-brows .bg-el-stat { flex: 1 1 0; min-width: 0; }\n  .bg-el-brows .bg-el-stat > span, .bg-el-brows .bg-el-stat b { white-space: normal; }
  .bg-el-place { min-width: 26px; text-align: center; font-size: 16px; font-weight: 800; color: var(--bg-text-muted); flex-shrink: 0; }
  .bg-ss-mark.bg-ss-none { color: var(--bg-text-muted); font-weight: 600; }
  .bg-ss-mark.bg-ss-bir { border-color: var(--score-good); color: var(--score-good); border-radius: 50%; }
  .bg-ss-mark.bg-ss-eag { border-color: var(--score-good); color: var(--score-good); border-radius: 50%; box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--score-good); }
  .bg-ss-mark.bg-ss-bog { border-color: var(--score-bad); color: var(--score-bad); }
  .bg-ss-mark.bg-ss-skin { border: 3px solid var(--bg-brand); border-radius: 50%; color: var(--accent); font-weight: 900; background: var(--bg-brand-tint); }
  .bg-ss-mark.bg-ss-fskin { border: 3px solid var(--bg-gold); border-radius: 50%; color: var(--bg-gold); font-weight: 900; }
  .bg-ss-mark.bg-ss-skin.bg-ss-fskin { border-color: var(--bg-brand); color: var(--accent); box-shadow: 0 0 0 1.5px var(--bg-surface), 0 0 0 4px var(--bg-gold); }
  .bg-ss-skins { font-weight: 800; color: var(--accent); white-space: nowrap; }
  .bg-ss-mark.bg-ss-dbl { background: var(--score-bad); border-color: var(--score-bad); color: #fff; }
  .bg-ss-dot { position: absolute; top: 1px; right: 0; font-size: 18px; line-height: 0.6; color: var(--bg-text); letter-spacing: -2px; }
  .bg-ss-pu { position: absolute; bottom: 0; right: 0; font-size: 9px; font-weight: 800; color: var(--bg-text-muted); }
  .bg-ss-sum { display: flex; flex-direction: column; align-items: center; font-size: 19px; font-weight: 800; line-height: 1.1; color: var(--bg-text); }
  .bg-ss-net { font-size: 12px; font-weight: 700; color: var(--accent); white-space: nowrap; }
  .bg-ss-total { display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; padding: 10px 12px; border-top: 1px solid var(--bg-border); font-size: 15px; color: var(--bg-text-muted); }
  .bg-ss-total > span:first-child { font-weight: 800; color: var(--bg-text); }
  .bg-ss-total b { font-size: 20px; font-weight: 800; color: var(--bg-text); }
  .bg-ss-note { position: relative; padding: 0 12px 10px; font-size: 13px; color: var(--bg-text-muted); }
  .bg-ss-note .bg-ss-dot { position: static; font-size: 18px; line-height: 1; }
  .bg-ss-key { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; font-size: 14px; color: var(--bg-text-muted); padding: 2px 0 4px; }
  .bg-ss-key > span { display: inline-flex; align-items: center; gap: 6px; }
  .bg-ss-mark.bg-ss-k { width: 16px; height: 16px; }
  @media (max-width: 374px) { .bg-ss-line { grid-template-columns: 32px repeat(9, minmax(0, 1fr)) minmax(0, 1.5fr); } .bg-ss-net { font-size: 11px; } .bg-ss-lab { font-size: 11px; } .bg-ss-nine { padding-left: 4px; padding-right: 4px; } #bg-sc-stand .bg-ss-row { column-gap: 8px; padding-left: 8px; padding-right: 8px; } .bg-ss-rank { min-width: 20px; font-size: 15px; } .bg-ss-meta { font-size: 14px; } .bg-ss-mark { font-size: 17px; width: 25px; height: 25px; } .bg-ss-mark.bg-ss-2d { font-size: 13px; } .bg-ss-name { font-size: 18px; } .bg-ss-big { font-size: 25px; } .bg-ss-av { width: 40px; height: 40px; font-size: 15px; } }
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
    one('markup', '''        <p class="help-text" style="margin:0 0 6px">Tap any score to fix it.</p>
        <div class="scorecard-wrap">
          <table class="scorecard" id="scorecard-score-tab"></table>''',
        '''        <div class="bg-ss-top"><p class="help-text" id="bg-sc-stand-help">Tap any score to fix it.</p><button type="button" class="bg-btn bg-btn--ghost bg-btn--sm" id="bg-sc-stand-switch">Classic scorecard</button></div>
        <div id="bg-sc-stand"></div>
        <div class="scorecard-wrap">
          <table class="scorecard" id="scorecard-score-tab"></table>''')
    one('paint hook', "        lg.innerHTML = bgScLegendHtml(dst.innerHTML);   // v1949\n      }\n    } catch (e) {}\n  } catch (e) {}\n}\nfunction renderScoreEntry() {",
        "        lg.innerHTML = bgScLegendHtml(dst.innerHTML);   // v1949\n      }\n    } catch (e) {}\n  } catch (e) {}\n  try { bgScStandPaint(g); } catch (e) {}   // v2087: the standings-first card\n}\n" + JS.lstrip('\n') + "function renderScoreEntry() {")
    a = src.index("function bgElevensAvHtml(p) {\n"); b = src.index("// Score screen card (v2086 look)")
    assert src.count("function bgElevensAvHtml(p) {\n") == 1 and a < b < a + 2500, (path, 'elevens av slice')
    src = src[:a] + "function bgElevensAvHtml(p) { let c = null; try { c = (p && state && state.game) ? (bgScStandColors(state.game)[p.id] || null) : null; } catch (e) { c = null; } return bgAvCircleHtml(p, 'bg-el-av', 'bg-el-av-photo', c, true); }   // v2087: shared circle (blank photo -> initials)\n" + src[b:]; n[0] += 1
    # --- 11's on Game results (Board / summary): same rows as the 11's card (Tyler 3:32pm) ---
    one('board cards', "      const cards = G.sides.map(s => bgElevensCard(g, G.cfg, s, !!g.finishedAt)).sort((a, b) => (b.kept - a.kept) || (a.total - b.total));",
        "      const cards = G.sides.map(s => { const c = bgElevensCard(g, G.cfg, s, !!g.finishedAt); c._side = s; return c; }).sort((a, b) => (b.kept - a.kept) || (a.total - b.total));\n      cards.forEach((c, i) => { const p = cards[i - 1]; c._pl = (p && p.kept === c.kept && p.total === c.total) ? p._pl : i + 1; });\n      cards.forEach(c => { c._tie = cards.filter(x => x._pl === c._pl).length > 1; });")
    a = src.index("        + cards.map(c => '<div class=\"sub\">' + escapeHtml(c.name) + ' "); b = src.index("        + '</div>';\n    });\n    try {   // v2086: a hole still waiting on keep / toss can be opened from here")
    assert 0 < b - a < 900, (path, 'board rows slice', b - a)
    src = src[:a] + """        + '<div class="bg-el-brows">' + cards.map(c => { const left = Math.max(0, c.maxOut - c.out);
            return '<div class="bg-el-row bg-el-brow"><span class="bg-el-place">' + (c.kept ? (c._tie ? 'T' : '') + c._pl : '') + '</span>'
              + '<span class="bg-el-avs">' + ((c._side && c._side.players) || []).map(bgElevensAvHtml).join('') + '</span>'
              + '<span class="bg-el-stat"><b><span class="bg-el-tot">' + (c.kept ? bgElevensToPar(c.total) : '\\u2014') + '</span>' + c.kept + '/' + c.need + ' kept</b>'
              + '<span>' + escapeHtml(c.name) + (c.done ? '' : ' \\u00b7 ' + left + ' toss' + (left === 1 ? '' : 'es') + ' left') + (c.pending ? ' \\u00b7 needs a choice' : '') + '</span></span></div>'; }).join('') + '</div>'
""" + src[b:]; n[0] += 1
    # --- "Next hole" with a keep / toss still owed opens the sheet first (Tyler 3:27pm: he tapped Next inside the 1.4 s wait and was never asked) ---
    one('next gate', "  const advanceNextHole = async (withGps) => {\n    if (!(await checkWolfPickGate())) return;\n",
        "  const advanceNextHole = async (withGps) => {\n    if (!(await checkWolfPickGate())) return;\n    try { if (typeof bgElevensNextGate === 'function' && bgElevensNextGate()) return; } catch (e) {}   // v2087: 11's keep / toss before leaving the hole\n")
    one('next gate fn', "// Called after a score goes in. Waits a beat (the scorer may still be tapping + / -), then opens the sheet.\nfunction bgElevensSheetArm(g, h, delayMs) {\n  try {\n    if (_bgElSheet.timer) { clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; }\n",
        "// v2087: leaving a hole that still owes a keep / toss answer opens its sheet instead (its Next buttons then move on).\nfunction bgElevensNextGate() {\n  try {\n    const g = state.game, h = Number(state.currentHole) || 0;\n    if (!g || !h || state.viewOnlyMode || document.getElementById('bg-el-sheet')) return false;\n    if (!bgElevensGames(g).length || !bgElevensSheetDue(g, h)) return false;\n    _bgElSheet.shown[String(g.code || '') + ':' + h] = 1;\n    return bgElevensSheetOpen(h) === true;\n  } catch (e) { return false; }\n}\n// Called after a score goes in. Waits a beat (the scorer may still be tapping + / -), then opens the sheet.\nfunction bgElevensSheetArm(g, h, delayMs) {\n  try {\n    // v2087: a wait that was running for ANOTHER hole is not thrown away - if that hole still owes an answer, ask now.\n    if (_bgElSheet.timer && _bgElSheet.armHole && _bgElSheet.armHole !== h && g && !state.viewOnlyMode && bgElevensSheetDue(g, _bgElSheet.armHole)) {\n      clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; const _ph = _bgElSheet.armHole; _bgElSheet.armHole = 0;\n      _bgElSheet.shown[String(g.code || '') + ':' + _ph] = 1; bgElevensSheetOpen(_ph); return;\n    }\n    if (_bgElSheet.timer) { clearTimeout(_bgElSheet.timer); _bgElSheet.timer = null; }\n")
    one('arm hole', "    _bgElSheet.timer = setTimeout(function () {\n      _bgElSheet.timer = null;\n", "    _bgElSheet.armHole = h;\n    _bgElSheet.timer = setTimeout(function () {\n      _bgElSheet.timer = null; _bgElSheet.armHole = 0;\n")
    one('css', "  /* v2086: the 11's card on the score screen */\n", CSS + "  /* v2086: the 11's card on the score screen */\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
