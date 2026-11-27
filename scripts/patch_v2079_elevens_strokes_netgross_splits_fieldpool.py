#!/usr/bin/env python3
# v2026.11.2079 -- 11's / Team 11's: raw strokes, a net / gross choice, winner / 80-20 / 70-30 splits,
# and the whole-field pool in an event (every group plays for one pool). Same edits to both files.
import sys, io
OLD_V, NEW_V = 'v2026.11.2078', 'v2026.11.2079'

def between(src, start, end):
    a = src.index(start); b = src.index(end, a)
    assert src.count(start) == 1, ('start not unique', start[:50], src.count(start))
    return a, b

NEW_GAMES = r'''// v2079: a day-level 11's set to "whole field" belongs to the EVENT (one pool across every group).
function bgElevensIsField(g, cfg) { try { return !!(cfg && (cfg.fieldOnly || (cfg.scope === 'field' && g && g.t2 && g.t2.tournamentId))); } catch (e) { return false; } }
// Which 11's games are on for this round. g.games = the day's game (whole field or per group);
// g.groupGames = a cart's own. One keep / throw-out per hole serves both, so one banner per game.
function bgElevensGames(g) {
  const out = [];
  try {
    [['elevens', false, "11's"], ['teamElevens', true, "Team 11's"]].forEach(a => {
      const fc = g.games && g.games[a[0]], gc = g.groupGames && g.groupGames[a[0]];
      const cfg = fc || gc;
      if (!cfg) return;
      const field = !!(fc && bgElevensIsField(g, fc));
      const sides = bgElevensSides(g, cfg, a[1]);
      if (sides.length >= (field ? 1 : 2)) out.push({ key: a[0], team: a[1], label: a[2], cfg: cfg, sides: sides, field: field });
    });
  } catch (e) {}
  return out;
}
'''

NEW_SHARES = r'''// Pool split: 'winner' takes it all, '8020' or '7030' for 1st and 2nd. Ties share the places they cover.
function bgElevensShares(payout, nParts, nElig) {
  let base = (payout === '8020') ? [0.8, 0.2] : (payout === '7030' || Number(payout) >= 2) ? [0.7, 0.3] : [1];
  if (nParts < 3 || nElig < 2) base = [1];
  return base;
}
function bgElevensPayout(cfg) { try { return (cfg.payout === '8020' || cfg.payout === '7030') ? cfg.payout : (Number(cfg.places) >= 2 ? '7030' : 'winner'); } catch (e) { return 'winner'; } }
// Walk a low-to-high ranking and hand each entry its share of the pool (ties share the places they cover).
function bgElevensSplit(ranked, shares) {
  const out = {};
  for (let i = 0; i < ranked.length;) {
    let j = i; while (j + 1 < ranked.length && ranked[j + 1].total === ranked[i].total) j++;
    let sh = 0; for (let k = i; k <= j; k++) sh += (shares[k] || 0);
    for (let k = i; k <= j; k++) out[ranked[k].key] = { share: sh / (j - i + 1), pos: i + 1, tied: j > i, paid: sh > 0 };
    i = j + 1;
  }
  return out;
}
'''

NEW_CALC = r'''function calcElevens(g) {
  try {
    const cfg = g && g.games && g.games.elevens;
    if (!cfg || bgElevensIsField(g, cfg) || !Array.isArray(g.players) || g.players.length < 2) return null;
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
    const place = bgElevensSplit(elig, bgElevensShares(bgElevensPayout(cfg), parts.length, elig.length));
    const pot = val * parts.length, money = {};
    g.players.forEach(p => { money[p.id] = 0; });
    parts.forEach(p => { money[p.id] = -val; });
    elig.forEach(c => { money[c.key] += pot * place[c.key].share; });
    if (Object.keys(money).every(id => Math.abs(money[id]) < 0.005)) return null;   // everyone level: the pool goes back
    const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th');
    const events = elig.filter(c => place[c.key].paid).map(c => ({
      kind: 'elevens', playerId: c.key,
      name: c.name + " — 11's " + bgElevensToPar(c.total) + ' (' + (place[c.key].tied ? 'T' : '') + ord(place[c.key].pos) + ')',
      amt: money[c.key]
    }));
    return { money: money, events: events, result: { need: cards[0] ? cards[0].need : 11, standings: cards.map(c => ({ id: c.key, name: c.name, kept: c.kept, total: c.total, done: c.done })) } };
  } catch (e) { return null; }
}
'''

FIELD = r'''/* v2079 (Tyler, 11/26): "build it as a pool where all groups play for the pool not just your group."
   A day-level 11's / Team 11's set to "whole field" is ONE pool per day across every group. The carts keep
   and throw out on their own score screens (g.elevensData rides on each round); this ranks every card
   (or every cart team, on its low ball) by strokes over the kept holes and splits the pool by cfg.payout.
   Same result shape as the other field pools: perDay[].rows[] + totalsByKey. Units wait for the day. */
function _t2FieldElevensAll(rows, gameKey) {
  try {
    if (!Array.isArray(rows) || !rows.length) return null;
    const team = gameKey === 'teamElevens';
    const nmk = s => normalizeNameSegment(String(s || ''));
    const first = p => (typeof displayFirst === 'function' ? displayFirst(p) : p.name);
    const byDay = {};
    rows.forEach(row => {
      const g = row && row.data ? row.data : row;
      if (!g || !Array.isArray(g.players)) return;
      const cfg = g.games && g.games[gameKey];
      if (!cfg || !bgElevensIsField(g, cfg)) return;
      const day = (g.t2 && g.t2.day) || 1;
      const d = byDay[day] = byDay[day] || { ents: {}, parts: {}, cfg: null, rounds: 0, finished: 0, optIn: undefined };
      if (!d.cfg) d.cfg = cfg;
      if (d.optIn === undefined) d.optIn = team ? null : _t2FieldOptIn(cfg);
      d.rounds++; if (g.finishedAt) d.finished++;
      { const _t = _t2RoundTouchMs(g); if (_t > (d.lastTouch || 0)) d.lastTouch = _t; }
      _t2NoteDayCards(d, g);
      bgElevensSides(g, cfg, team).forEach(side => {
        const mem = side.players.filter(p => p && p.name).map(p => ({ key: nmk(p.name), name: p.name, first: first(p), id: p.id }));
        if (!mem.length) return;
        if (!team && d.optIn && !d.optIn.has(mem[0].key)) return;          // he sat this pool out
        const scored = side.players.reduce((n, p) => n + ((g.scores && g.scores[p.id]) || []).filter(x => x != null).length, 0);
        if (!scored) return;                                                // no card posted, not in the pool
        const key = team ? (String(g.code || (g.t2 && g.t2.group) || '') + ':' + side.key) : mem[0].key;
        const cur = d.ents[key];
        if (cur && cur.scored >= scored) return;                            // one entry per player: the fullest card
        d.ents[key] = { key: key, name: team ? side.name : mem[0].name, first: team ? side.name : mem[0].first, g: g, cfg: cfg, side: side, mem: mem, scored: scored };
      });
    });
    const perDay = [], totalsByName = {};
    Object.keys(byDay).sort((a, b) => a - b).forEach(day => {
      const d = byDay[day], cfg = d.cfg || {}, ents = Object.values(d.ents);
      if (ents.length < 2) return;
      const complete = _t2DayFieldComplete(d, true);
      const val = Number(cfg.value) || 0;
      ents.forEach(e => {
        e.card = bgElevensCard(e.g, e.cfg, e.side, complete || !!e.g.finishedAt);
        e.total = e.card.total;
        e.left = e.mem.some(m => typeof bgLeftAfter === 'function' && bgLeftAfter(e.g, m.id) != null);
      });
      const nPlayers = ents.reduce((n, e) => n + e.mem.length, 0), pot = val * nPlayers;
      const elig = ents.filter(e => e.card.done && !e.left).sort((a, b) => a.total - b.total);
      const payout = bgElevensPayout(cfg);
      const place = bgElevensSplit(elig, bgElevensShares(payout, ents.length, elig.length));
      const paying = complete && elig.length > 0 && val > 0;
      const rowsOut = [];
      ents.forEach(e => {
        const pl = place[e.key] || null, won = pl ? pot * pl.share : 0;
        e.mem.forEach(m => {
          const live = won / e.mem.length - val, money = paying ? live : 0;
          rowsOut.push({ name: m.name, first: m.first, money: money, live: (elig.length ? live : 0), total: e.card.total, kept: e.card.kept, need: e.card.need, done: e.card.done, pos: pl ? pl.pos : null, tied: !!(pl && pl.tied), team: team ? e.name : '' });
          if (paying && Math.abs(money) > 0.0001) { totalsByName[m.key] = totalsByName[m.key] || { name: m.name, first: m.first, net: 0 }; totalsByName[m.key].net += money; }
        });
      });
      rowsOut.sort((a, b) => ((a.pos || 999) - (b.pos || 999)) || (b.kept - a.kept) || (a.total - b.total) || String(a.first || '').localeCompare(String(b.first || '')));
      const standings = ents.slice().sort((a, b) => ((b.card.done ? 1 : 0) - (a.card.done ? 1 : 0)) || (b.card.kept - a.card.kept) || (a.total - b.total))
        .map(e => ({ name: e.name, first: e.first, total: e.card.total, kept: e.card.kept, need: e.card.need, done: e.card.done, pos: place[e.key] ? place[e.key].pos : null, tied: !!(place[e.key] && place[e.key].tied), won: paying && place[e.key] ? pot * place[e.key].share : 0 }));
      perDay.push({ day: Number(day), complete: complete, paying: paying, players: nPlayers, entries: ents.length, value: val, pot: pot, payout: payout, net: cfg.net !== false, team: team, rows: rowsOut, standings: standings });
    });
    if (!perDay.length) return null;
    return { perDay: perDay, totals: Object.values(totalsByName).filter(x => x.net !== 0).sort((a, b) => b.net - a.net), totalsByKey: totalsByName };
  } catch (e) { return null; }
}
function t2ComputeFieldElevens(rows) { return _bgFlightGeneric(rows, r => _t2FieldElevensAll(r, 'elevens')); }
// Team 11's is never cut by flight: a cart team can have a player in each.
function t2ComputeFieldTeamElevens(rows) { try { return _t2FieldElevensAll(bgT2EarlyTrimRows(rows), 'teamElevens'); } catch (e) { return null; } }
// "Who won what" rows for the event's award list.
function bgElevensPotRows(raw, out) {
  [[t2ComputeFieldElevens, "11's"], [t2ComputeFieldTeamElevens, "Team 11's"]].forEach(a => {
    try {
      const r = a[0](raw);
      ((r && r.perDay) || []).forEach(d => {
        const lbl = a[1] + (d.flight ? ' — Flight ' + d.flight : ' — whole field');
        const st = d.standings || [], top = st.filter(s => s.pos === 1);
        const det = 'best ' + ((st[0] && st[0].need) || 11) + ' holes, ' + (d.net ? 'net' : 'gross') + ' · ' + d.value + ' each · ' + (d.payout === '8020' ? '80/20' : d.payout === '7030' ? '70/30' : 'winner takes all')
          + '\n' + st.slice(0, 6).map(s => s.name + ' ' + (s.done ? s.total : s.kept + '/' + s.need + ' kept')).join(' · ');
        out.push(_bgPotRow(lbl, top.length ? top.map(s => s.name).join(' / ') : '', det, (d.paying && top.length) ? top[0].won : 0, d.complete === false ? 'still live' : ''));
      });
    } catch (e) {}
  });
}
'''

def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 2, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new, cnt=1):
        nonlocal src
        c = src.count(old); assert c == cnt, (path, name, c, 'expected', cnt)
        src = src.replace(old, new); n[0] += 1
    def fn(name, start, end, new):
        nonlocal src
        a, b = between(src, start, end); src = src[:a] + new + src[b:]; n[0] += 1

    # --- raw strokes ---
    one('raw strokes', "    return net - par;\n  } catch (e) { return null; }\n}\nfunction bgElevensSides", "    return net;   // v2079 (Tyler): raw strokes, not to par\n  } catch (e) { return null; }\n}\nfunction bgElevensSides")
    one('total text', "function bgElevensToPar(v) { v = Math.round((Number(v) || 0) * 100) / 100; return v === 0 ? 'E' : (v > 0 ? '+' + v : String(v)); }",
        "function bgElevensToPar(v) { return String(Math.round((Number(v) || 0) * 100) / 100); }   // v2079: a stroke total (the name is historical)")
    one('header comment', "after each hole: the next hole cannot be scored until the choice is in, and the choice locks once the next hole\n   has a score. Lowest total to par over the kept holes wins.",
        "after each hole: the next hole cannot be scored until the choice is in, and the choice locks once the next hole\n   has a score. Lowest total STROKES over the kept holes wins (v2079; net or gross).")
    # --- games list / field ---
    fn('games', "// Which 11's games are on for this round (a cart's own games in an event live in g.groupGames).\nfunction bgElevensGames(g) {", "function bgElevensLocked(card, h)", NEW_GAMES)
    fn('shares', "// Pool payout by place: 1 = winner takes it, 2 = 70/30, 3 = 50/30/20. Ties share the places they cover.\nfunction bgElevensShares(", "function calcElevens(g) {", NEW_SHARES)
    fn('calc', "function calcElevens(g) {", "function calcTeamElevens(g) {", NEW_CALC)
    one('team calc field', "    if (!cfg || cfg.fieldOnly || !Array.isArray(g.players)) return null;\n    if (!Array.isArray(cfg.teamA) || !Array.isArray(cfg.teamB)) return null;",
        "    if (!cfg || bgElevensIsField(g, cfg) || !Array.isArray(g.players)) return null;\n    if (!Array.isArray(cfg.teamA) || !Array.isArray(cfg.teamB)) return null;")
    one('field engine', "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {", FIELD + "// Two phones can answer the same hole: the newer stamp wins, per side, per hole.\nfunction _bgMergeElevens(local, cloud) {")
    # banner + board wording
    one('banner head', "'</strong> <span class=\"small-text\">best ' + bgElevensNeed(g) + ' holes' + (G.team ? ', team low ball' : '') + '</span></div>'",
        "'</strong> <span class=\"small-text\">best ' + bgElevensNeed(g) + ' holes' + (G.team ? ', team low ball' : '') + ' · ' + (G.cfg.net === false ? 'gross' : 'net') + (G.field ? ' · whole field' : '') + '</span></div>'")
    one('board head', "escapeHtml(G.label) + (val ? ' (' + val + ' per player)' : '') + '</span><span class=\"val\">best ' + cards[0].need + '</span></div>'",
        "escapeHtml(G.label) + (val ? ' (' + val + ' per player)' : '') + (G.field ? ' · whole field' : '') + '</span><span class=\"val\">best ' + cards[0].need + ' · ' + (G.cfg.net === false ? 'gross' : 'net') + '</span></div>'")
    # --- event board hooks ---
    one('event compute', "    let fBirdie = null; try { fBirdie = t2ComputeFieldBirdiePool(raw); } catch (e) {}",
        "    let fBirdie = null; try { fBirdie = t2ComputeFieldBirdiePool(raw); } catch (e) {}\n    let fElev = null, fTElev = null; try { fElev = t2ComputeFieldElevens(raw); } catch (e) {} try { fTElev = t2ComputeFieldTeamElevens(raw); } catch (e) {}   // v2079: whole-field 11's")
    one('event totals', "[fBirdie, 'Birdie Bump']].forEach(pair => {", "[fBirdie, 'Birdie Bump'], [fElev, \"11's\"], [fTElev, \"Team 11's\"]].forEach(pair => {")
    one('event pending', "      if (fBirdie && Array.isArray(fBirdie.perDay) && fBirdie.perDay.some(d => d.complete === false)) {",
        "      [[fElev, \"11's\"], [fTElev, \"Team 11's\"]].forEach(pr => { try { if (pr[0] && Array.isArray(pr[0].perDay)) { gameTotals[pr[1]] = gameTotals[pr[1]] || {}; _alwaysShowGameLabels.add(pr[1]); if (pr[0].perDay.some(d => d.complete === false)) _pendingGameLabels.add(pr[1]); } } catch (e) {} });   // v2079\n      if (fBirdie && Array.isArray(fBirdie.perDay) && fBirdie.perDay.some(d => d.complete === false)) {")
    one('award rows', "    // Birdie Bump (field) — v1321. Added in v1317 with a settlement engine and a", "    try { bgElevensPotRows(raw, out); } catch (e) {}   // v2079: whole-field 11's / Team 11's\n    // Birdie Bump (field) — v1321. Added in v1317 with a settlement engine and a")
    # --- setup ---
    one('setup places', '''            <div class="field" style="margin-top:8px">
              <label for="elevens-places">Places paid</label>
              <select id="elevens-places">
                <option value="1">1st takes it all</option>
                <option value="2">1st and 2nd (70 / 30)</option>
                <option value="3">Top 3 (50 / 30 / 20)</option>
              </select>
            </div>
''', '''            <div class="field" style="margin-top:8px">
              <label for="elevens-payout">Split</label>
              <select id="elevens-payout">
                <option value="winner">Winner takes all</option>
                <option value="8020">80/20 split (1st/2nd)</option>
                <option value="7030">70/30 split (1st/2nd)</option>
              </select>
            </div>
            <div class="field" style="margin-top:8px">
              <label for="elevens-net">Net or gross</label>
              <select id="elevens-net">
                <option value="net">Net</option>
                <option value="gross">Gross</option>
              </select>
            </div>
            <div class="field bg-el-scope" style="margin-top:8px;display:none">
              <label for="elevens-scope">Who plays for the pool</label>
              <select id="elevens-scope">
                <option value="field">Whole field - every group, one pool</option>
                <option value="group">Each group plays its own</option>
              </select>
            </div>
''')
    one('setup help ind', "You get 7 throw-outs; when they are gone every hole counts. Lowest total to par over the kept holes wins. <strong>0%</strong> handicap = gross.",
        "You get 7 throw-outs; when they are gone every hole counts. Lowest total strokes over the kept holes wins, net or gross. Winner takes all, or split 80/20 or 70/30 between 1st and 2nd; ties share the places they cover. In an event the pool can run across the whole field.")
    one('setup team scope', '''            <div class="team-picker-section" data-game="teamElevens">''', '''            <div class="field" style="margin-top:8px">
              <label for="team-elevens-payout">Split (whole-field pool)</label>
              <select id="team-elevens-payout">
                <option value="winner">Winner takes all</option>
                <option value="8020">80/20 split (1st/2nd)</option>
                <option value="7030">70/30 split (1st/2nd)</option>
              </select>
            </div>
            <div class="field bg-el-scope" style="margin-top:8px;display:none">
              <label for="team-elevens-scope">Who plays for the pool</label>
              <select id="team-elevens-scope">
                <option value="field">Whole field - every team, one pool</option>
                <option value="group">Each group plays its own</option>
              </select>
            </div>
            <div class="team-picker-section" data-game="teamElevens">''')
    one('setup help team', "the best 11 team holes count (7 throw-outs). Lowest total to par wins and each player on the other team gives the units.",
        "the best 11 team holes count (7 throw-outs). Lowest total strokes wins and each player on the other team gives the units. In an event set to whole field, every team in every group plays for one pool and the split applies.")
    one('gather ind', "    games.elevens = { value: parseFloat($('elevens-value').value) || 0, mode: 'pool', hcpPct: _elPct, places: parseInt(($('elevens-places') || {}).value, 10) || 1 };",
        "    var _elNet = !($('elevens-net') && $('elevens-net').value === 'gross');\n    games.elevens = { value: parseFloat($('elevens-value').value) || 0, mode: 'pool', net: _elNet, hcpPct: _elNet ? _elPct : 0, payout: ($('elevens-payout') || {}).value || 'winner' };\n    if (state._t2DayConfig) games.elevens.scope = (($('elevens-scope') || {}).value === 'group') ? 'group' : 'field';   // v2079: an event day defaults to one pool across every group")
    one('gather team day', "      games.teamElevens = { value: _teVal, net: _teNet, teamMode: '2man', teamA: [], teamB: [] };",
        "      games.teamElevens = { value: _teVal, net: _teNet, teamMode: '2man', teamA: [], teamB: [], payout: ($('team-elevens-payout') || {}).value || 'winner', scope: (($('team-elevens-scope') || {}).value === 'group') ? 'group' : 'field' };")
    one('restore ind', "      if ($('elevens-places')) $('elevens-places').value = String(games.elevens.places || 1);",
        "      if ($('elevens-payout')) $('elevens-payout').value = bgElevensPayout(games.elevens);\n      if ($('elevens-net')) $('elevens-net').value = games.elevens.net === false ? 'gross' : 'net';\n      if ($('elevens-scope')) $('elevens-scope').value = games.elevens.scope === 'group' ? 'group' : 'field';")
    one('restore team', "      if ($('team-elevens-net')) $('team-elevens-net').value = games.teamElevens.net === false ? 'gross' : 'net';",
        "      if ($('team-elevens-net')) $('team-elevens-net').value = games.teamElevens.net === false ? 'gross' : 'net';\n      if ($('team-elevens-payout')) $('team-elevens-payout').value = bgElevensPayout(games.teamElevens);\n      if ($('team-elevens-scope')) $('team-elevens-scope').value = games.teamElevens.scope === 'group' ? 'group' : 'field';")
    one('restore scope ui', "  try {   // v2078\n    if (games.elevens) {", "  try { bgElevensScopeUi(); } catch (e) {}   // v2079\n  try {   // v2078\n    if (games.elevens) {")
    one('scope ui fn', "function bgElevensNeed(g) {", "// v2079: the \"who plays for the pool\" row only means something on an event day; the handicap slider only when net.\nfunction bgElevensScopeUi() {\n  try {\n    const day = !!(state && state._t2DayConfig);\n    document.querySelectorAll('.bg-el-scope').forEach(el => { el.style.display = day ? '' : 'none'; });\n    const f = document.getElementById('elevens-hcp-pct-field'), n = document.getElementById('elevens-net');\n    if (f && n) f.style.display = (n.value === 'gross') ? 'none' : '';\n  } catch (e) {}\n}\ntry { document.addEventListener('change', function (e) { try { const id = e && e.target && e.target.id; if (id === 'game-elevens' || id === 'game-team-elevens' || id === 'elevens-net') bgElevensScopeUi(); } catch (err) {} }); } catch (e) {}\nfunction bgElevensNeed(g) {")
    one('help ind', "Lowest total to par over the kept holes wins. The pool pays 1st, 1st and 2nd (70/30) or the top 3 (50/30/20), and ties share the places they cover.\"",
        "Lowest total strokes over the kept holes wins, net or gross. The pool is winner takes all, or split 80/20 or 70/30 between 1st and 2nd, and ties share the places they cover. In an event it can be one pool across every group.\"")
    one('help team', "Lowest total to par wins and each player on the other team gives the units. A tie moves nothing.\"",
        "Lowest total strokes wins and each player on the other team gives the units. A tie moves nothing. In an event set to whole field, every team in every group plays for one pool (winner takes all, 80/20 or 70/30).\"")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
