#!/usr/bin/env python3
# v2026.11.2078 -- 11's and Team 11's (regular rounds + a cart's own games in an event).
# Each player (or team, on its low ball) counts the best 11 net holes; after every hole they must
# say keep or throw out before the next hole can be scored; the choice locks once the next hole has
# a score. Same edits to golf-app.html and www/index.html, one match per anchor.
import sys, io
OLD_V, NEW_V = 'v2026.11.2077', 'v2026.11.2078'

ENGINE = r'''/* ===================== v2078: 11's and Team 11's (Tyler, 11/26 - "Brewer mentioned a game called 11's") =====================
   Each player counts only the best 11 NET holes of the 18 (6 of 9), but has to say "keep" or "throw out" right
   after each hole: the next hole cannot be scored until the choice is in, and the choice locks once the next hole
   has a score. Lowest total to par over the kept holes wins. Team 11's is the same game on the team's low ball.
   g.elevensData = { <player id | 'T:A' | 'T:B'>: { <hole>: { v: 'k' | 'x', at } } }  (newest stamp wins per hole).
   The 11th keep and the 7th throw-out are forced by the count, so the last hole never needs a choice. */
function bgElevensNeed(g) { try { const n = ((typeof roundHoles === 'function') ? roundHoles(g) : 18) || 18; return n >= 18 ? 11 : Math.max(1, Math.round(n * 11 / 18)); } catch (e) { return 11; } }
function bgElevensHcp(g, p, cfg) {
  try {
    if (!p || (cfg && cfg.net === false)) return 0;
    if ((g.hcpRules && g.hcpRules.noHandicaps) || p.playsGross === true) return 0;
    const pct = (cfg && cfg.hcpPct != null && cfg.hcpPct !== '' && !isNaN(Number(cfg.hcpPct))) ? Number(cfg.hcpPct) : null;
    if (pct != null) return bgHcpPct(bgFullCourseHcp(p, g.hcpRules), pct);
    return effectiveHcp(p, g.hcpRules);
  } catch (e) { return 0; }
}
// One player's hole, net, against his own par. null = no score yet.
function bgElevensHoleVal(g, p, h, cfg) {
  try {
    const s = (g.scores && g.scores[p.id]) ? g.scores[p.id][h - 1] : null;
    if (s == null || s === '') return null;
    const par = Number(parFor(g, p.id, h - 1));
    const net = (Array.isArray(g.sis) && typeof netHoleScore === 'function')
      ? netHoleScore(Number(s), bgElevensHcp(g, p, cfg), siFor(g, p.id, h - 1), par, g.hcpRules || null, roundHoles(g)) : Number(s);
    return net - par;
  } catch (e) { return null; }
}
function bgElevensSides(g, cfg, team) {
  try {
    const first = p => (typeof displayFirst === 'function' ? displayFirst(p) : (p && p.name) || '?');
    if (!team) return (getParticipants(g, cfg) || []).map(p => ({ key: p.id, name: first(p), players: [p] }));
    const mk = (ids, key) => { const ps = (Array.isArray(ids) ? ids : []).map(id => (g.players || []).find(p => p && p.id === id)).filter(Boolean); return { key: key, name: ps.map(first).join(' & ') || (key === 'T:A' ? 'Team A' : 'Team B'), players: ps, team: true }; };
    return [mk(cfg.teamA, 'T:A'), mk(cfg.teamB, 'T:B')].filter(s => s.players.length);
  } catch (e) { return []; }
}
// The side's number on a hole: the player's own, or the team's LOW ball once every player still in has scored.
function bgElevensSideVal(g, cfg, side, h) {
  try {
    const act = side.players.filter(p => (typeof bgActiveOnHole !== 'function') || bgActiveOnHole(g, p.id, h));
    if (!act.length) return null;
    const vals = act.map(p => bgElevensHoleVal(g, p, h, cfg));
    if (vals.some(v => v == null)) return null;
    return Math.min.apply(null, vals);
  } catch (e) { return null; }
}
// Walk a side's card in the order the holes were played. fin = the round is over (an unanswered hole counts).
function bgElevensCard(g, cfg, side, fin) {
  const n = ((typeof roundHoles === 'function') ? roundHoles(g) : 18) || 18, need = Math.min(bgElevensNeed(g), n), maxOut = n - need;
  const seq = (typeof _bgPlaySeqOr === 'function') ? _bgPlaySeqOr(g, n) : Array.from({ length: n }, (_, i) => i + 1);
  const data = (g.elevensData && g.elevensData[side.key]) || {};
  const out = { key: side.key, name: side.name, team: !!side.team, rows: [], byHole: {}, kept: 0, out: 0, pending: 0, total: 0, scored: 0, need: need, maxOut: maxOut, n: n, lastPos: -1 };
  seq.forEach((h, pos) => {
    const v = bgElevensSideVal(g, cfg, side, h);
    let row;
    if (v == null) row = { h: h, st: 'none', pos: pos };
    else {
      out.scored++; out.lastPos = pos;
      const rec = data[h] || data[String(h)] || null, pick = rec && rec.v;
      let st, forced = false;
      if (out.kept >= need) { st = 'out'; forced = true; }
      else if (out.out >= maxOut) { st = 'keep'; forced = true; }
      else if (pick === 'k') st = 'keep';
      else if (pick === 'x') st = 'out';
      else if (fin) { st = 'keep'; forced = true; }
      else st = 'pending';
      if (st === 'keep') { out.kept++; out.total += v; } else if (st === 'out') out.out++; else out.pending++;
      row = { h: h, st: st, forced: forced, v: v, pos: pos };
    }
    out.rows.push(row); out.byHole[h] = row;
  });
  out.done = out.scored >= n && out.pending === 0 && out.kept === need;
  return out;
}
function bgElevensToPar(v) { v = Math.round((Number(v) || 0) * 100) / 100; return v === 0 ? 'E' : (v > 0 ? '+' + v : String(v)); }
// Which 11's games are on for this round (a cart's own games in an event live in g.groupGames).
function bgElevensGames(g) {
  const out = [];
  try {
    [['elevens', false, "11's"], ['teamElevens', true, "Team 11's"]].forEach(a => {
      const cfg = (typeof bgSideCfg === 'function') ? bgSideCfg(g, a[0]) : (g.games && g.games[a[0]]);
      if (!cfg || cfg.fieldOnly) return;
      const sides = bgElevensSides(g, cfg, a[1]);
      if (sides.length >= 2) out.push({ key: a[0], team: a[1], label: a[2], cfg: cfg, sides: sides });
    });
  } catch (e) {}
  return out;
}
function bgElevensLocked(card, h) { try { const r = card.byHole[h]; return !!(r && r.st !== 'none' && card.lastPos > r.pos); } catch (e) { return false; } }
// Score gate: a NEW score is refused while this player (or his team) still owes a keep / throw-out on another hole.
function bgElevensScoreGate(g, pid, h) {
  try {
    if (!g || g.finishedAt) return '';
    const cur = (g.scores && g.scores[pid]) ? g.scores[pid][h - 1] : null;
    if (cur != null) return '';   // changing a score already on the card is never blocked
    const gms = bgElevensGames(g);
    for (let i = 0; i < gms.length; i++) {
      const G = gms[i], side = G.sides.find(s => s.players.some(p => p.id === pid));
      if (!side) continue;
      const c = bgElevensCard(g, G.cfg, side, false);
      const pend = c.rows.find(r => r.st === 'pending' && r.h !== h);
      if (pend) return G.label + ': keep or throw out hole ' + pend.h + ' for ' + side.name + ' first';
    }
  } catch (e) {}
  return '';
}
async function bgElevensSet(gameKey, sideKey, h, v) {
  try {
    const g = state.game;
    if (!g || state.viewOnlyMode) return;
    const G = bgElevensGames(g).find(x => x.key === gameKey); if (!G) return;
    const side = G.sides.find(s => String(s.key) === String(sideKey)); if (!side) return;
    const c = bgElevensCard(g, G.cfg, side, false), r = c.byHole[h];
    if (!r || r.st === 'none') { showToast('Enter the score first', 'warn'); return; }
    if (r.forced) { showToast(r.st === 'keep' ? 'No throw-outs left - this hole counts' : c.need + ' holes already kept - this hole is not needed', 'warn'); return; }
    if (bgElevensLocked(c, h)) {
      if (!(typeof isAdmin === 'function' && isAdmin())) { showToast('Locked - the next hole is already scored', 'warn'); return; }
      if (!(await uiConfirm('Hole ' + h + ' is locked for ' + side.name + ' because a later hole is scored.\n\nChange it anyway?'))) return;
    }
    if (!g.elevensData || typeof g.elevensData !== 'object') g.elevensData = {};
    if (!g.elevensData[side.key] || typeof g.elevensData[side.key] !== 'object') g.elevensData[side.key] = {};
    g.elevensData[side.key][h] = { v: (v === 'x' ? 'x' : 'k'), at: Date.now() };
    g.updatedAt = Date.now();
    try { renderGameBanners(); } catch (e) {}
    try { if (typeof bgAutoAdvanceArm === 'function') bgAutoAdvanceArm(g, h); } catch (e) {}
    await saveGame(g);
    try { renderGameBanners(); } catch (e) {}
  } catch (e) { try { console.warn('11s set failed', e); } catch (e2) {} }
}
// Any keep / throw-out still owed on this hole (keeps "Next hole" auto-advance from running past it).
function bgElevensPendingOnHole(g, h) {
  try { return bgElevensGames(g).some(G => G.sides.some(s => { const r = bgElevensCard(g, G.cfg, s, false).byHole[h]; return !!(r && r.st === 'pending'); })); } catch (e) { return false; }
}
function bgElevensBanners(g, h, banners) {
  bgElevensGames(g).forEach(G => {
    const div = document.createElement('div');
    div.className = 'turn-banner';
    let pend = false, rows = '';
    G.sides.forEach(s => {
      const c = bgElevensCard(g, G.cfg, s, false), r = c.byHole[h] || { st: 'none' };
      if (r.st === 'pending') pend = true;
      const left = Math.max(0, c.maxOut - c.out);
      let ctl;
      if (r.st === 'none') ctl = '<span class="small-text">Score first</span>';
      else if (r.forced) ctl = '<span class="small-text">' + (r.st === 'keep' ? 'Counts - no throw-outs left' : 'Not needed - ' + c.need + ' kept') + '</span>';
      else {
        const lock = bgElevensLocked(c, h);
        ctl = '<button class="bg-btn ' + (r.st === 'keep' ? 'wolf-sel' : '') + '" data-el-game="' + G.key + '" data-el-side="' + escapeHtml(String(s.key)) + '" data-el-v="k">' + (r.st === 'keep' ? '✅ ' : '') + 'Keep ' + bgElevensToPar(r.v) + '</button>'
            + '<button class="bg-btn ' + (r.st === 'out' ? 'wolf-sel' : '') + '" data-el-game="' + G.key + '" data-el-side="' + escapeHtml(String(s.key)) + '" data-el-v="x">' + (r.st === 'out' ? '✅ ' : '') + 'Throw out</button>'
            + (lock ? '<span class="small-text">🔒</span>' : '');
      }
      rows += '<div style="margin-top:6px"><div><strong>' + escapeHtml(s.name) + '</strong> <span class="small-text">' + c.kept + '/' + c.need + ' kept · ' + (c.kept ? bgElevensToPar(c.total) : '—') + ' · ' + left + ' throw-out' + (left === 1 ? '' : 's') + ' left</span></div><div class="controls">' + ctl + '</div></div>';
    });
    if (pend) { div.style.background = 'rgba(232,144,32,0.12)'; div.style.borderColor = 'var(--warn, var(--gold))'; div.style.borderWidth = '2px'; }
    div.innerHTML = '<div><strong>' + escapeHtml(G.label) + '</strong> <span class="small-text">best ' + bgElevensNeed(g) + ' holes' + (G.team ? ', team low ball' : '') + '</span></div>'
      + (pend ? '<div style="color:var(--warn, var(--gold));font-weight:700;margin-top:2px">⚠️ Keep or throw out before the next hole</div>' : '') + rows;
    banners.appendChild(div);
    div.querySelectorAll('[data-el-v]').forEach(b => { b.onclick = () => bgElevensSet(b.dataset.elGame, b.dataset.elSide, h, b.dataset.elV); });
  });
}
// Board card: live standings for both games.
function bgElevensBoardHtml(g) {
  let html = '';
  try {
    bgElevensGames(g).forEach(G => {
      const cards = G.sides.map(s => bgElevensCard(g, G.cfg, s, !!g.finishedAt)).sort((a, b) => (b.kept - a.kept) || (a.total - b.total));
      const val = Number(G.cfg.value) || 0;
      html += '<div class="game-result"><div class="head"><span class="lbl">' + ((typeof bgGameIconPrefix === 'function') ? bgGameIconPrefix(G.key) : '') + escapeHtml(G.label) + (val ? ' (' + val + ' per player)' : '') + '</span><span class="val">best ' + cards[0].need + '</span></div>'
        + cards.map(c => '<div class="sub">' + escapeHtml(c.name) + ' — ' + (c.kept ? bgElevensToPar(c.total) : '—') + ' · ' + c.kept + '/' + c.need + ' kept' + (c.done ? '' : ' · ' + Math.max(0, c.maxOut - c.out) + ' throw-out' + ((c.maxOut - c.out) === 1 ? '' : 's') + ' left') + (c.pending ? ' · needs a choice' : '') + '</div>').join('')
        + '</div>';
    });
  } catch (e) {}
  return html;
}
// Pool payout by place: 1 = winner takes it, 2 = 70/30, 3 = 50/30/20. Ties share the places they cover.
function bgElevensShares(places, nParts, nElig) {
  let want = Math.max(1, Math.min(3, Math.round(Number(places) || 1)));
  want = Math.min(want, Math.max(1, nParts - 1), Math.max(1, nElig));
  const base = ({ 1: [1], 2: [0.7, 0.3], 3: [0.5, 0.3, 0.2] })[want];
  const sum = base.reduce((a, b) => a + b, 0);
  return base.map(x => x / sum);
}
function calcElevens(g) {
  try {
    const cfg = g && g.games && g.games.elevens;
    if (!cfg || cfg.fieldOnly || !Array.isArray(g.players) || g.players.length < 2) return null;
    const parts = getParticipants(g, cfg);
    if (!parts || parts.length < 2) return null;
    const val = Number(cfg.value) || 0;
    if (val <= 0) return null;
    const fin = !!g.finishedAt;
    const cards = bgElevensSides(g, cfg, false).map(s => bgElevensCard(g, cfg, s, fin));
    if (!cards.every(c => c.done) && !fin) return null;                 // nothing moves until every card is in
    const elig = cards.filter(c => c.done && (typeof bgLeftAfter !== 'function' || bgLeftAfter(g, c.key) == null));
    if (!elig.length) return null;
    elig.sort((a, b) => a.total - b.total);
    const shares = bgElevensShares(cfg.places, parts.length, elig.length);
    const pot = val * parts.length, money = {}, place = {};
    g.players.forEach(p => { money[p.id] = 0; });
    parts.forEach(p => { money[p.id] = -val; });
    for (let i = 0; i < elig.length;) {
      let j = i; while (j + 1 < elig.length && elig[j + 1].total === elig[i].total) j++;
      let sh = 0; for (let k = i; k <= j; k++) sh += (shares[k] || 0);
      for (let k = i; k <= j; k++) { money[elig[k].key] += pot * sh / (j - i + 1); place[elig[k].key] = { pos: i + 1, tied: j > i, paid: sh > 0 }; }
      i = j + 1;
    }
    if (Object.keys(money).every(id => Math.abs(money[id]) < 0.005)) return null;   // everyone level: the pool goes back
    const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th');
    const events = elig.filter(c => place[c.key] && place[c.key].paid).map(c => ({
      kind: 'elevens', playerId: c.key,
      name: c.name + " — 11's " + bgElevensToPar(c.total) + ' (' + (place[c.key].tied ? 'T' : '') + ord(place[c.key].pos) + ')',
      amt: money[c.key]
    }));
    return { money: money, events: events, result: { need: cards[0] ? cards[0].need : 11, standings: cards.map(c => ({ id: c.key, name: c.name, kept: c.kept, total: c.total, done: c.done })) } };
  } catch (e) { return null; }
}
function calcTeamElevens(g) {
  try {
    const cfg = g && g.games && g.games.teamElevens;
    if (!cfg || cfg.fieldOnly || !Array.isArray(g.players)) return null;
    if (!Array.isArray(cfg.teamA) || !Array.isArray(cfg.teamB)) return null;
    const sides = bgElevensSides(g, cfg, true);
    if (sides.length !== 2 || sides[0].players.length !== sides[1].players.length || cfg.teamA.length !== cfg.teamB.length) return _bgDropBet('teamElevens', 'uneven teams — a player was probably removed mid-round');
    const val = Number(cfg.value) || 0;
    const fin = !!g.finishedAt;
    const A = bgElevensCard(g, cfg, sides[0], fin), B = bgElevensCard(g, cfg, sides[1], fin);
    if (!A.done || !B.done) return null;
    const money = {}; g.players.forEach(p => { money[p.id] = 0; });
    const result = { teamA: A.name, teamB: B.name, aTotal: A.total, bTotal: B.total, need: A.need, complete: true, winner: A.total === B.total ? 'Tie' : (A.total < B.total ? A.name : B.name) };
    const events = [];
    if (A.total !== B.total && val > 0) {
      const W = A.total < B.total ? sides[0] : sides[1], L = A.total < B.total ? sides[1] : sides[0];
      W.players.forEach(p => { money[p.id] = val; }); L.players.forEach(p => { money[p.id] = -val; });
      W.players.forEach(p => events.push({ kind: 'teamElevens', playerId: p.id, name: W.name + " — Team 11's " + bgElevensToPar(Math.min(A.total, B.total)) + ' v ' + bgElevensToPar(Math.max(A.total, B.total)), amt: val }));
    }
    return { money: money, events: events, result: result };
  } catch (e) { return null; }
}
// Two phones can answer the same hole: the newer stamp wins, per side, per hole.
function _bgMergeElevens(local, cloud) {
  try {
    const cm = (cloud && cloud.elevensData && typeof cloud.elevensData === 'object') ? cloud.elevensData : null;
    if (!cm) return;
    if (!local.elevensData || typeof local.elevensData !== 'object') local.elevensData = {};
    Object.keys(cm).forEach(k => {
      const c = cm[k]; if (!c || typeof c !== 'object') return;
      if (!local.elevensData[k] || typeof local.elevensData[k] !== 'object') local.elevensData[k] = {};
      const l = local.elevensData[k];
      Object.keys(c).forEach(h => { const a = l[h], b = c[h]; if (!a || ((b && b.at > 0 ? b.at : 0) > (a && a.at > 0 ? a.at : 0))) l[h] = b; });
    });
  } catch (e) {}
}
'''

SETUP_HTML = '''          <!-- v2078: 11's - best 11 net holes, keep or throw out after every hole -->
          <label class="game-toggle">
            <input type="checkbox" id="game-elevens"><span class="gt-ic" aria-hidden="true">🔢</span>
            <div style="flex:1">
              <div class="name">11's</div>
              <div class="desc">Best 11 net holes count. Keep or throw out after every hole. Low total takes the prize pool.</div>
            </div>
            <button type="button" class="bg-btn bg-btn--ghost bg-btn--icon game-help-btn" data-game-key="elevens" title="What is 11's?">?</button>
          </label>
          <div class="game-options" id="opts-elevens">
            <div class="field">
              <label for="elevens-value">Entry units per player</label>
              <input type="number" id="elevens-value" value="5" min="0" max="10000" step="0.5" inputmode="decimal">
            </div>
            <div class="field" style="margin-top:8px">
              <label for="elevens-places">Places paid</label>
              <select id="elevens-places">
                <option value="1">1st takes it all</option>
                <option value="2">1st and 2nd (70 / 30)</option>
                <option value="3">Top 3 (50 / 30 / 20)</option>
              </select>
            </div>
            <div class="field" style="margin-top:10px" id="elevens-hcp-pct-field">
              <label for="elevens-hcp-pct">Handicap for 11's: <span id="elevens-hcp-pct-label" style="color:var(--accent);font-weight:600">100%</span></label>
              <input type="range" id="elevens-hcp-pct" min="0" max="100" step="5" value="100" style="width:100%">
            </div>
            <div class="help-text">
              Only your best 11 net holes count (6 on a nine). After each hole you choose keep or throw out, and the next hole cannot be scored until you do. The choice locks once the next hole has a score. You get 7 throw-outs; when they are gone every hole counts. Lowest total to par over the kept holes wins. <strong>0%</strong> handicap = gross.
            </div>
          </div>

          <!-- v2078: Team 11's - the same game on the team's low ball -->
          <label class="game-toggle">
            <input type="checkbox" id="game-team-elevens"><span class="gt-ic" aria-hidden="true">🔢</span>
            <div style="flex:1">
              <div class="name">Team 11's</div>
              <div class="desc">Even teams. The team's low ball each hole; best 11 holes count. Keep or throw out after every hole.</div>
            </div>
            <button type="button" class="bg-btn bg-btn--ghost bg-btn--icon game-help-btn" data-game-key="teamElevens" title="What is Team 11's?">?</button>
          </label>
          <div class="game-options" id="opts-team-elevens">
            <div class="field">
              <label for="team-elevens-value">Units per player</label>
              <input type="number" id="team-elevens-value" value="5" min="0" step="1">
            </div>
            <div class="field" style="margin-top:8px">
              <label for="team-elevens-net">Net or gross</label>
              <select id="team-elevens-net">
                <option value="net">Net</option>
                <option value="gross">Gross</option>
              </select>
            </div>
            <div class="team-picker-section" data-game="teamElevens">
              <h3 style="margin-top:10px">Teams</h3>
              <div class="team-picker" id="team-picker-teamElevens"></div>
              <div class="help-text" id="team-picker-help-teamElevens">Tap a player to assign them to Team A or Team B. Teams must be even.</div>
            </div>
            <div class="help-text">
              Each hole the team's score is its low ball. After the hole the team chooses keep or throw out; the best 11 team holes count (7 throw-outs). Lowest total to par wins and each player on the other team gives the units.
            </div>
          </div>

'''

GATHER = '''  // v2078: 11's (pool by place) and Team 11's (two even teams, low ball)
  if ($('game-elevens') && $('game-elevens').checked) {
    var _elPct = parseInt(($('elevens-hcp-pct') || {}).value, 10);
    if (isNaN(_elPct)) _elPct = 100;
    games.elevens = { value: parseFloat($('elevens-value').value) || 0, mode: 'pool', hcpPct: _elPct, places: parseInt(($('elevens-places') || {}).value, 10) || 1 };
  }
  if ($('game-team-elevens') && $('game-team-elevens').checked) {
    var _teVal = parseFloat($('team-elevens-value').value) || 0, _teNet = $('team-elevens-net').value === 'net';
    if (state._t2DayConfig) {
      games.teamElevens = { value: _teVal, net: _teNet, teamMode: '2man', teamA: [], teamB: [] };
    } else {
      if (players.length < 2 || players.length % 2 !== 0) { showToast("Team 11's needs an even number of players (2+)"); return null; }
      var _teTeams = buildTeamAssignment(players, 'teamElevens');
      if (!_teTeams) { showToast("Team 11's: teams must be even. Check the team picker."); return null; }
      games.teamElevens = { value: _teVal, net: _teNet, teamMode: '2man', teamA: _teTeams.teamA, teamB: _teTeams.teamB };
    }
  }
'''

RESTORE = '''  try {   // v2078
    if (games.elevens) {
      if ($('elevens-value') && games.elevens.value != null) $('elevens-value').value = games.elevens.value;
      if ($('elevens-places')) $('elevens-places').value = String(games.elevens.places || 1);
      if ($('elevens-hcp-pct')) { $('elevens-hcp-pct').value = (games.elevens.hcpPct != null ? games.elevens.hcpPct : 100); if ($('elevens-hcp-pct-label')) $('elevens-hcp-pct-label').textContent = $('elevens-hcp-pct').value + '%'; }
    }
    if (games.teamElevens) {
      if ($('team-elevens-value') && games.teamElevens.value != null) $('team-elevens-value').value = games.teamElevens.value;
      if ($('team-elevens-net')) $('team-elevens-net').value = games.teamElevens.net === false ? 'gross' : 'net';
      restoreTeamPickerFromSaved('teamElevens', games.teamElevens, config);
    }
  } catch (e) {}
'''

HELP = '''  elevens: {
    title: "11's",
    body: "Everyone puts in the same entry. Only your best 11 net holes count (6 on a nine-hole round). The catch: right after each hole you must choose keep or throw out, and the app will not take your next hole until you do. Once the next hole has a score the choice is locked. You have 7 throw-outs; when they are gone every remaining hole counts, and once 11 are kept the rest are not needed. Lowest total to par over the kept holes wins. The pool pays 1st, 1st and 2nd (70/30) or the top 3 (50/30/20), and ties share the places they cover."
  },
  teamElevens: {
    title: "Team 11's",
    body: "Two even teams. On each hole the team's score is its low net ball. After the hole the team chooses keep or throw out before anyone on the team can score the next one; the best 11 team holes count and the team has 7 throw-outs. Lowest total to par wins and each player on the other team gives the units. A tie moves nothing."
  },
'''

E = []
def ed(name, old, new, count=1): E.append((name, old, new, count))

ed('engine', 'function calcLowNetPool(g) {', ENGINE + 'function calcLowNetPool(g) {')
ed('setup html', '          <label class="game-toggle">\n            <input type="checkbox" id="game-lownet">', SETUP_HTML + '          <label class="game-toggle">\n            <input type="checkbox" id="game-lownet">')
ed('gather', "  if ($('game-lownet') && $('game-lownet').checked) {", GATHER + "  if ($('game-lownet') && $('game-lownet').checked) {")
ed('restore', "  if (games.lowNetPool && $('lownet-value') && games.lowNetPool.value != null) $('lownet-value').value = games.lowNetPool.value;",
   RESTORE + "  if (games.lowNetPool && $('lownet-value') && games.lowNetPool.value != null) $('lownet-value').value = games.lowNetPool.value;")
ed('help', "  lownet: {\n    title: 'Low Net Pool',", HELP + "  lownet: {\n    title: 'Low Net Pool',")
ed('results', "    lowNetPool: calcLowNetPool(g),      // v914", "    lowNetPool: calcLowNetPool(g),      // v914\n    elevens: calcElevens(g), teamElevens: calcTeamElevens(g),   // v2078")
ed('labels', "    lowNetPool: 'Low Net Pool',\n", "    lowNetPool: 'Low Net Pool',\n    elevens: \"11's\", teamElevens: \"Team 11's\",\n")
ed('dom maps pool', "'lownet': 'lowNetPool', 'girpool': 'girPool', 'puttspool': 'puttsPool',", "'lownet': 'lowNetPool', 'elevens': 'elevens', 'girpool': 'girPool', 'puttspool': 'puttsPool',", 5)
ed('dom maps team', "'team-lowball': 'teamLowball',", "'team-lowball': 'teamLowball', 'team-elevens': 'teamElevens',", 6)
ed('opts toggles', "'potofgold','lownet','girpool','puttspool']", "'potofgold','lownet','girpool','puttspool','elevens','team-elevens']", 2)
ed('reset list', "'game-potofgold','game-lownet','game-girpool','game-puttspool',", "'game-potofgold','game-lownet','game-girpool','game-puttspool','game-elevens','game-team-elevens',")
ed('participants', "  { key: 'lownet',    min: 2, label: 'Low Net Pool participants' },", "  { key: 'lownet',    min: 2, label: 'Low Net Pool participants' },\n  { key: 'elevens',   min: 2, label: \"11's participants\" },")
ed('pool keys', "const BG_POOL_GAME_KEYS = new Set(['lownet', 'girpool', 'puttspool', 'longputt', 'longdrive']);", "const BG_POOL_GAME_KEYS = new Set(['lownet', 'girpool', 'puttspool', 'longputt', 'longdrive', 'elevens']);")
ed('timing', "lowNetPool: 'end', girPool: 'end',", "lowNetPool: 'end', elevens: 'end', teamElevens: 'end', girPool: 'end',")
ed('t2 rule pool', "  'lownet':       { always: true },", "  'lownet':       { always: true },\n  'elevens':      { always: true },         // v2078: 11's - any players")
ed('t2 rule team', "  'team-lowball': { even: true },", "  'team-lowball': { even: true },\n  'team-elevens': { even: true },           // v2078: Team 11's - even teams")
ed('t2 cfg key', "teamLowball: 'team-lowball', comboScore: 'combo-score',", "teamLowball: 'team-lowball', teamElevens: 'team-elevens', comboScore: 'combo-score',")
ed('game labels', "birdiePool: 'Birdie Bump', lowNetPool: 'Low Net Pool', girPool: 'GIR Pool',", "birdiePool: 'Birdie Bump', lowNetPool: 'Low Net Pool', elevens: \"11's\", teamElevens: \"Team 11's\", girPool: 'GIR Pool',")
ed('event totals', "  'lowNetPool', 'girPool', 'puttsPool'];", "  'lowNetPool', 'girPool', 'puttsPool', 'elevens', 'teamElevens'];")
ed('summary line', "    if (k === 'lowNetPool' || k === 'girPool' || k === 'puttsPool' || k === 'ctp' ||", "    if (k === 'lowNetPool' || k === 'elevens' || k === 'teamElevens' || k === 'girPool' || k === 'puttsPool' || k === 'ctp' ||")
ed('detail line', "        } else if (K === 'lowNetPool' || K === 'girPool' || K === 'puttsPool') {", "        } else if (K === 'lowNetPool' || K === 'elevens' || K === 'teamElevens' || K === 'girPool' || K === 'puttsPool') {")
ed('icon', "lowNetPool:'🥇',", "lowNetPool:'🥇', elevens:'🔢', teamElevens:'🔢',")
ed('name map', "'low net pool':'lowNetPool',", "'low net pool':'lowNetPool', \"11's\":'elevens', \"team 11's\":'teamElevens',")
ed('lbl map', "snake: 'Snake', lowNetPool: 'Low Net Pool', girPool: 'GIR Pool', puttsPool: 'Fewest Putts Pool' };", "snake: 'Snake', lowNetPool: 'Low Net Pool', elevens: \"11's\", teamElevens: \"Team 11's\", girPool: 'GIR Pool', puttsPool: 'Fewest Putts Pool' };")
ed('individual cards gate', "'game-bbb','game-lownet','game-girpool',", "'game-bbb','game-lownet','game-elevens','game-team-elevens','game-girpool',")
ed('team day disable', "'game-lownet', 'game-girpool', 'game-puttspool'].forEach(id => {", "'game-lownet', 'game-elevens', 'game-team-elevens', 'game-girpool', 'game-puttspool'].forEach(id => {")
ed('merge rule', "  shambleData: 'custom',     // v1764", "  elevensData: 'custom',     // v2078: 11's keep / throw-out per side per hole - newest `at` wins (_bgMergeElevens)\n  shambleData: 'custom',     // v1764")
ed('merge call', "    _bgMergeStampedHoleMap(local, cloud, 'shambleData');   // v1764: the drive used on a hole", "    _bgMergeStampedHoleMap(local, cloud, 'shambleData');   // v1764: the drive used on a hole\n    _bgMergeElevens(local, cloud);   // v2078")
ed('story labels', "teamMatch: 'Team Match', stroke: 'Stroke', lowNetPool: 'Low Net Pool',", "teamMatch: 'Team Match', stroke: 'Stroke', lowNetPool: 'Low Net Pool', elevens: \"11's\", teamElevens: \"Team 11's\",")
ed('round settled', "                                    'lowNetPool', 'girPool', 'puttsPool', 'scramble',", "                                    'lowNetPool', 'elevens', 'teamElevens', 'girPool', 'puttsPool', 'scramble',")
ed('team pickers', "['teamMatch', 'teamLowball', 'shamble', 'comboScore', 'teamQuota', 'ryderCup', 'scramble', 'vegas', 'highLow', 'umbrella'].forEach(gameKey => {", "['teamMatch', 'teamLowball', 'teamElevens', 'shamble', 'comboScore', 'teamQuota', 'ryderCup', 'scramble', 'vegas', 'highLow', 'umbrella'].forEach(gameKey => {")
ed('t2 team games', "const TEAM_GAMES = ['scramble', 'teamMatch', 'teamLowball', 'shamble',", "const TEAM_GAMES = ['scramble', 'teamMatch', 'teamLowball', 'teamElevens', 'shamble',")
ed('t2 pair', "const PAIR = ['scramble', 'teamLowball', 'shamble', 'comboScore', 'teamQuota', 'teamMatch', 'ryderCup', 'vegas', 'dvegas'];", "const PAIR = ['scramble', 'teamLowball', 'teamElevens', 'shamble', 'comboScore', 'teamQuota', 'teamMatch', 'ryderCup', 'vegas', 'dvegas'];")
ed('t2 team day keys', "const _T2_TEAM_DAY_KEYS = ['scramble', 'teamMatch', 'teamLowball',", "const _T2_TEAM_DAY_KEYS = ['scramble', 'teamMatch', 'teamLowball', 'teamElevens',")
ed('team touched', "['teamMatch', 'teamLowball', 'shamble', 'comboScore', 'teamQuota', 'ryderCup', 'scramble', 'highLow', 'umbrella'].forEach(k => {", "['teamMatch', 'teamLowball', 'teamElevens', 'shamble', 'comboScore', 'teamQuota', 'ryderCup', 'scramble', 'highLow', 'umbrella'].forEach(k => {")
ed('units team row', "['scramble', 'ryderCup', 'teamMatch', 'teamLowball', 'shamble', 'comboScore', 'teamQuota', 'vegas', 'highLow', 'umbrella']", "['scramble', 'ryderCup', 'teamMatch', 'teamLowball', 'teamElevens', 'shamble', 'comboScore', 'teamQuota', 'vegas', 'highLow', 'umbrella']")
ed('banner', "  // WOLF / CAPTAIN banner", "  try { bgElevensBanners(g, h, banners); } catch (e) {}   // v2078: 11's keep / throw out\n\n  // WOLF / CAPTAIN banner")
ed('score gate', "  if (consentBlockToast(g, pid)) return;\n  { const _bg = bgBracketScoreGate(g, pid); if (_bg) { showToast(_bg, 'warn'); return; } }   // v1167\n",
   "  if (consentBlockToast(g, pid)) return;\n  { const _bg = bgBracketScoreGate(g, pid); if (_bg) { showToast(_bg, 'warn'); return; } }   // v1167\n  { const _eg = bgElevensScoreGate(g, pid, state.currentHole); if (_eg) { showToast(_eg, 'warn'); try { renderGameBanners(); } catch (e) {} return; } }   // v2078: 11's - choose before the next hole\n")
ed('auto advance', "    if (typeof wolfPickMissingOnHole === 'function' && _bgWolfCfg(g) && wolfPickMissingOnHole(g, h)) return false;   // v1945",
   "    if (typeof wolfPickMissingOnHole === 'function' && _bgWolfCfg(g) && wolfPickMissingOnHole(g, h)) return false;   // v1945\n    if (typeof bgElevensPendingOnHole === 'function' && bgElevensPendingOnHole(g, h)) return false;   // v2078")
ed('board card', "  // v1771: Snake on its own line -- who holds it, how many snakes, what it pays.",
   "  try { const _elH = bgElevensBoardHtml(g); if (_elH) { const _elD = document.createElement('div'); _elD.innerHTML = _elH; while (_elD.firstChild) gr.appendChild(_elD.firstChild); } } catch (e) {}   // v2078: 11's standings\n\n  // v1771: Snake on its own line -- who holds it, how many snakes, what it pays.")
ed('slider label', "  { const _lh = $('lownet-hcp-pct'); if (_lh) _lh.oninput",
   "  { const _eh = $('elevens-hcp-pct'); if (_eh) _eh.oninput = function (e) { try { const l = $('elevens-hcp-pct-label'); if (l) l.textContent = e.target.value + '%'; } catch (err) {} }; }   // v2078\n  { const _lh = $('lownet-hcp-pct'); if (_lh) _lh.oninput")

def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 2, (path, 'version', src.count(OLD_V))
    for name, old, new, cnt in E:
        c = src.count(old)
        assert c == cnt, (path, name, c, 'expected', cnt)
        src = src.replace(old, new)
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', len(E), 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
