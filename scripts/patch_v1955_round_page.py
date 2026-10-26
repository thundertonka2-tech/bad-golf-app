#!/usr/bin/env python3
"""v1955 — every round gets the event-page treatment: the follow-along page uses the event page's
tabs (Leaderboard / Scorecard / Units / Prize pools / Matches), and the link key is minted at
round creation instead of first share."""
import sys

EDITS = []

# ── 1. the page ──
EDITS.append((
"""async function _bgLbRender() {
  if (!_bgLb) return;
  const S = _bgLb, el = S.el;
  let g = null; try { g = await _bgLbLoad(S.opts); } catch (e) { g = null; }
  if (!_bgLb || _bgLb !== S) return;
  if (g && g.revoked) { el.innerHTML = '<div class="bglb-msg">This leaderboard link isn’t working. Ask whoever sent it for a new one.</div>'; S.loaded = false; return; }
  if (!g) { if (!S.loaded) el.innerHTML = '<div class="bglb-msg">Couldn’t load the leaderboard — check your connection.</div>'; return; }
  // nothing changed since the last paint -> keep the reader's scroll position
  const stamp = String(g.serverUpdatedAt || g.updatedAt || '') + ':' + String(g.finishedAt || '');
  if (S.loaded && stamp === S.stamp) return;
  S.stamp = stamp; S.loaded = true;
  try { migrateLegacyData(g); } catch (e) {}
  try { if (typeof roundHoles === 'function') roundHoles(g); } catch (e) {}
  let body = '';
  try { body = buildRoundSummary(g); } catch (e) { try { console.warn('bgLb summary', e); } catch (_) {} body = ''; }
  if (!body) { try { body = _bgLbFallbackHtml(g); } catch (e) { body = '<div class="help-text">No scores yet.</div>'; } }
  // thru: holes with any score
  let nH = 18; try { nH = roundHoles(g) || 18; } catch (e) {}
  let thru = 0; try { for (let h = 0; h < nH; h++) { if ((g.players || []).some(p => g.scores && g.scores[p.id] && g.scores[p.id][h] != null)) thru++; } } catch (e) {}
  const done = !!g.finishedAt;
  const when = g.createdAt ? new Date(Number(g.createdAt)) : null;
  const now = new Date();
  el.innerHTML = '<div class="bglb-top"><img class="bglb-logo" src="BadGolfIcon.jpg" alt="" onerror="this.style.visibility=\\'hidden\\'">'
    + '<div class="bglb-title"><div class="bglb-ev" data-noi18n>' + t2esc(g.course || 'Bad Golf round') + '</div>'
    + '<div class="bglb-sub">' + (when ? t2esc(when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + ' · ' : '') + (g.players || []).length + ' players' + (done ? ' · Final' : (thru ? ' · thru ' + thru : ' · not started')) + '</div></div>'
    + '<div class="bglb-live"><b' + (done ? ' class="done"' : '') + '>●</b> ' + (done ? 'Final' : 'Live') + '<br>Updated ' + t2esc(now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) + '</div></div>'
    + '<div class="bglb-body">' + body + '</div>'
    + '<div class="bglb-foot"><span>Want to play next time?</span> <a href="' + BG_APPSTORE_URL + '" target="_blank" rel="noopener">Get Bad Golf for iPhone</a> <span>·</span> <a href="' + BG_PLAYSTORE_URL + '" target="_blank" rel="noopener">Android</a>'
    + (typeof isSignedIn === 'function' && isSignedIn() ? ' <span role="button" tabindex="0" class="bg-btn" id="bglb-x" style="margin-left:8px">Close</span>' : '') + '</div>';
  { const x = el.querySelector('#bglb-x'); if (x) x.onclick = (e) => { e.stopPropagation(); bgLbClose(); }; }
}
""",
"""/* v1955 (Tyler, 10/26): "what would it take to do this for all games?" The round's
   follow-along page is now the EVENT page for a round: the same tabs (Leaderboard,
   Scorecard, Units, Prize pools, Matches when there are any), the same cards, the same
   skins / stroke-dot / ✍︎ marks and the who-pays-whom list -- drawn from the one round
   with the app's own engines. The v1894 buildRoundSummary dump is retired here. */
async function _bgLbRender(reload) {
  if (!_bgLb) return;
  const S = _bgLb, el = S.el;
  if (reload || !S.g) {
    let g = null; try { g = await _bgLbLoad(S.opts); } catch (e) { g = null; }
    if (!_bgLb || _bgLb !== S) return;
    if (g && g.revoked) { el.innerHTML = '<div class="evp-wrap"><p class="help-text" style="padding:40px 0;text-align:center">This leaderboard link isn’t working. Ask whoever sent it for a new one.</p></div>'; S.loaded = false; return; }
    if (!g) { if (!S.loaded) el.innerHTML = '<div class="evp-wrap"><p class="help-text" style="padding:40px 0;text-align:center">Couldn’t load the leaderboard — check your connection.</p></div>'; return; }
    // nothing changed since the last paint -> keep the reader's scroll position
    const stamp = String(g.serverUpdatedAt || g.updatedAt || '') + ':' + String(g.finishedAt || '');
    if (S.loaded && stamp === S.stamp) return;
    S.stamp = stamp; S.loaded = true;
    try { migrateLegacyData(g); } catch (e) {}
    try { if (typeof roundHoles === 'function') roundHoles(g); } catch (e) {}
    S.g = g;
  }
  const g = S.g, esc = t2esc;
  const players = Array.isArray(g.players) ? g.players : [];
  const full = p => { try { return displayFull(p) || p.name || '?'; } catch (e) { return (p && p.name) || '?'; } };
  let nH = 18; try { nH = roundHoles(g) || 18; } catch (e) {}
  let thru = 0; try { for (let h = 0; h < nH; h++) { if (players.some(p => g.scores && g.scores[p.id] && g.scores[p.id][h] != null)) thru++; } } catch (e) {}
  const done = !!g.finishedAt;
  const when = (g.finishedAt || g.createdAt) ? new Date(Number(g.finishedAt || g.createdAt)) : null;
  let matchLines = []; try { matchLines = bgMatchResultLines(g) || []; } catch (e) { matchLines = []; }
  let pots = ''; try { pots = _bgPotTableHtml(bgPotRowsForRound(g), 'Who won what') || ''; } catch (e) { pots = ''; }
  const tabs = [['board', 'Leaderboard'], ['card', 'Scorecard'], ['units', 'Units']];
  if (pots) tabs.push(['pools', 'Prize pools']);
  if (matchLines.length) tabs.push(['matches', 'Matches']);
  if (!tabs.some(tb => tb[0] === S.tab)) S.tab = 'board';
  let h = '<div class="evp-wrap">';
  h += '<div class="evp-top"><img class="evp-logo" src="BadGolfIcon.jpg" alt="" onerror="this.style.display=\\'none\\'"><div style="flex:1;min-width:0"><h1 class="evp-name" data-noi18n>' + esc(g.course || 'Bad Golf round') + '</h1>'
    + '<div class="evp-sub"><span data-noi18n>' + (when ? esc(when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + ' · ' : '') + players.length + ' players' + (done ? ' · Final' : (thru ? ' · Live, thru ' + thru : ' · Not started')) + '</span></div></div>'
    + (typeof isSignedIn === 'function' && isSignedIn() ? '<button type="button" class="bg-btn bg-btn--ghost bg-btn--icon" id="bglb-x" aria-label="Close">✕</button>' : '') + '</div>';
  h += '<div class="evp-tabs">' + tabs.map(tb => '<button type="button" class="bg-btn bg-btn--chip bg-btn--sm' + (S.tab === tb[0] ? ' is-on' : '') + '" aria-pressed="' + (S.tab === tb[0]) + '" data-evtab="' + tb[0] + '">' + tb[1] + '</button>').join('') + '</div>';
  if (S.tab === 'board') {
    let M = { rows: [] };
    try { M = bgTvModel([{ data: g }], {}); } catch (e) {}
    const rows = (M.rows || []).slice().sort((a, b) => (a.toPar - b.toPar) || (b.holesToday - a.holesToday) || String(a.name).localeCompare(String(b.name)));
    if (!rows.length) h += '<p class="help-text" style="padding:20px 0;text-align:center">No scores yet. Check back once play starts.</p>';
    else {
      h += '<div class="evp-card"><div class="evp-row hd"><span>#</span><span>Player</span><span class="v">Net</span><span class="v">Thru</span></div>';
      let pos = 0;
      rows.forEach((r, i) => {
        if (i === 0 || r.toPar !== rows[i - 1].toPar) pos = i + 1;
        const tie = rows.filter(z => z.toPar === r.toPar).length > 1;
        h += '<div class="evp-row"><span class="p">' + (tie ? 'T' : '') + pos + '</span><span class="n" data-noi18n>' + esc(r.name) + '</span><span class="v' + (r.toPar < 0 ? ' under' : '') + '">' + _bgTvToPar(r.toPar) + '</span><span class="v" style="font-weight:600">' + esc(r.thru || '') + '</span></div>';
      });
      h += '</div><div class="small-text" style="color:var(--text-muted);text-align:center">Net to par' + (done ? '' : ' · updates every 30 seconds') + '</div>';
    }
  } else if (S.tab === 'card') {
    let card = ''; try { card = buildRoundScorecardHtml(g) || ''; } catch (e) { card = ''; }
    h += card ? ('<div class="evp-card evp-sc" style="padding:8px">' + card + '</div>') : '<p class="help-text" style="padding:20px 0;text-align:center">No scores yet. Check back once play starts.</p>';
  } else if (S.tab === 'pools') {
    h += '<div class="evp-pools">' + pots + '</div>';
  } else if (S.tab === 'matches') {
    h += '<div class="evp-card">' + matchLines.map(l => '<div class="evp-row" style="grid-template-columns:minmax(0,1fr)"><span class="n" data-noi18n style="white-space:normal">' + esc(l) + '</span></div>').join('') + '</div>';
  } else {
    let money = {}, byGame = [];
    try { const am = computeAllGameMoney(g) || {}; money = am.combined || {}; byGame = Array.isArray(am.byGame) ? am.byGame : []; } catch (e) {}
    const nets = (function () { try { return bgSettleNets(money, players); } catch (e) { return money; } })();
    const rows = players.map(p => ({ id: p.id, name: full(p), net: Number(nets[p.id]) || 0 })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
    const any = rows.some(r => r.net) || byGame.length;
    if (!any) h += '<p class="help-text" style="padding:20px 0;text-align:center">No units yet — they settle as the round goes.</p>';
    else {
      if (!done) h += '<div class="small-text" style="color:var(--text-muted);margin:0 0 8px">Provisional — the round isn’t final yet.</div>';
      const open = S.openU || (S.openU = {});
      const sg = v => String(signed(Number(v) || 0)).replace(/^-/, '−');
      h += '<div class="evp-card">';
      rows.forEach((r, i) => {
        h += '<button type="button" class="evp-urow" data-uk="' + esc(String(r.id)) + '" aria-expanded="' + (!!open[r.id]) + '"><span class="p">' + (i + 1) + '</span><span class="n" data-noi18n>' + esc(r.name) + '</span>'
          + '<span class="v ' + (r.net > 0.005 ? 'pos' : (r.net < -0.005 ? 'neg' : '')) + '">' + sg(r.net) + '</span><span class="c" aria-hidden="true">' + (open[r.id] ? '▾' : '▸') + '</span></button>';
        if (open[r.id]) {
          const lines = byGame.map(gm => ({ label: gm.label || gm.key, v: (gm.money && gm.money[r.id]) || 0 })).filter(x => Math.abs(x.v) > 0.004);
          h += '<div class="evp-ubd">' + (lines.length ? lines.map(x => '<div><span data-noi18n>' + esc(x.label) + '</span><span class="v">' + sg(x.v) + '</span></div>').join('') : '<div><span>No units in any game</span><span class="v">0</span></div>') + '</div>';
        }
      });
      h += '</div><div class="small-text" style="color:var(--text-muted);text-align:center">Units · tap a player for each game</div>';
      try {
        const st = calculateSettlements(money, players) || [];
        const nm = id => { const p = players.find(pp => pp && pp.id === id); return p ? full(p) : '?'; };
        h += '<div class="evp-sec" style="margin-top:14px">Final standings' + (done ? '' : ' <span class="small-text" style="font-weight:400;color:var(--text-muted)">(provisional)</span>') + '</div><div class="evp-card">';
        if (!st.length) h += '<div class="evp-row" style="grid-template-columns:minmax(0,1fr)"><span class="n">All square — nobody trails anybody</span></div>';
        else st.forEach(s => { h += '<div class="evp-row" style="grid-template-columns:minmax(0,1fr) 64px"><span class="n" data-noi18n>' + esc(nm(s.fromId)) + ' → ' + esc(nm(s.toId)) + '</span><span class="v">' + esc(bgWhole(s.amount)) + '</span></div>'; });
        h += '</div>';
      } catch (e) {}
    }
  }
  h += '<div class="evp-foot"><span>Want to play next time?</span> <a href="' + BG_APPSTORE_URL + '" target="_blank" rel="noopener">Get Bad Golf for iPhone</a> <span>·</span> <a href="' + BG_PLAYSTORE_URL + '" target="_blank" rel="noopener">Android</a><br><span>Scored with</span> <a href="' + esc(BG_PUBLIC_URL) + '" target="_blank" rel="noopener">Bad Golf</a></div></div>';
  el.innerHTML = h;
  { const x = el.querySelector('#bglb-x'); if (x) x.onclick = (e) => { e.stopPropagation(); bgLbClose(); }; }
  el.querySelectorAll('[data-evtab]').forEach(b => b.onclick = () => { S.tab = b.dataset.evtab; _bgLbRender(false); });
  el.querySelectorAll('[data-uk]').forEach(b => b.onclick = () => { const k = b.dataset.uk; S.openU = S.openU || {}; S.openU[k] = !S.openU[k]; _bgLbRender(false); });
}
""",
"render"))

EDITS.append((
"""async function bgLbOpen(opts) {
  try {
    _bgLbCss();
    bgLbClose();
    const el = document.createElement('div');
    el.id = 'bglb';
    el.innerHTML = '<div class="bglb-msg">Loading the leaderboard…</div>';
    document.body.appendChild(el);
    _bgLb = { opts: opts, el: el, timer: null, stamp: null, loaded: false };
    await _bgLbRender();
    _bgLb.timer = setInterval(() => { try { _bgLbRender(); } catch (e) {} }, 30000);""",
"""async function bgLbOpen(opts) {
  try {
    _bgEvpCss();   // v1955: the round page IS the event page's layout
    bgLbClose();
    try { if (typeof bgEventPageClose === 'function') bgEventPageClose(); } catch (e) {}
    const el = document.createElement('div');
    el.id = 'bgevp';
    el.innerHTML = '<div class="evp-wrap"><div class="help-text" style="padding:40px 0;text-align:center">Loading the round…</div></div>';
    document.body.appendChild(el);
    _bgLb = { opts: opts, el: el, timer: null, stamp: null, loaded: false, tab: 'board', g: null };
    await _bgLbRender(true);
    _bgLb.timer = setInterval(() => { try { _bgLbRender(true); } catch (e) {} }, 30000);""",
"open"))

# ── 2. mint the key at round creation (plain rounds + league rounds) ──
EDITS.append((
"""      createdByUid: (typeof _authUser !== 'undefined' && _authUser && _authUser.id) ? String(_authUser.id) : null,   // v1802 (H3): ownership by account id, not name
      createdAt: Date.now(),
      updatedAt: Date.now()
    };""",
"""      createdByUid: (typeof _authUser !== 'undefined' && _authUser && _authUser.id) ? String(_authUser.id) : null,   // v1802 (H3): ownership by account id, not name
      lbKey: bgLbMintKey(),   // v1955: every round is born with its follow-along page link
      createdAt: Date.now(),
      updatedAt: Date.now()
    };""",
"mint plain round"))
EDITS.append((
"""      holes: (holes === 9) ? 9 : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    game.players.forEach(function (p) { game.scores[p.id] = new Array(18).fill(null); });""",
"""      holes: (holes === 9) ? 9 : undefined,
      lbKey: bgLbMintKey(),   // v1955
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    game.players.forEach(function (p) { game.scores[p.id] = new Array(18).fill(null); });""",
"mint league round"))


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
