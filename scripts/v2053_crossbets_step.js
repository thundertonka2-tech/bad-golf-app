/* ============================================================
   v2053 (Tyler, 11/20): "We really need to fix it to where I can setup cross bets prior
   to starting the tournament. This is very confusing."
   Cross bets used to live in three places: Match / Nassau picks hidden inside a cart's
   game tiles, and Stroke play / Quota only on the card's banner after your own group had
   teed off. Now there is ONE place before the start: the setup checklist's "Cross bets"
   row. Every bet of the day is stored on the tournament row --
     t.settings.crossBets[day][id] = { kind:'match'|'nassau'|'stroke'|'quota', names:[a,b],
                                       value, net, per, format, segments, savedAt, by, off? }
   -- and the event engine (t2ComputeCrossGroupMatches) reads it straight from there, so a
   bet does not depend on any round existing. At launch, a Match / Nassau whose two players
   land on the SAME cart becomes that cart's own game at the same terms (Tyler's call); a
   Stroke / Quota pair on one cart still pays through the event payout, labelled "same group".
   Decisions (AskUserQuestion 11/20): checklist row after Groups/Games; all four games there
   and the cart tiles stop offering other groups' players; same cart = group game; the
   commissioner/admins set them before the start, players keep the on-card builder after.
   ============================================================ */
// The day's live (not removed) event cross bets, oldest first.
function bgT2CrossBetsFor(t, day) {
  const out = [];
  try {
    const cb = t && t.settings && t.settings.crossBets;
    const bag = cb && (cb[day] || cb[String(day)]);
    if (!bag || typeof bag !== 'object') return out;
    Object.keys(bag).forEach(id => {
      const b = bag[id];
      if (!b || typeof b !== 'object' || b.off || !Array.isArray(b.names) || b.names.length < 2) return;
      out.push(Object.assign({ id: id }, b));
    });
    out.sort((a, b) => (Number(a.savedAt) || 0) - (Number(b.savedAt) || 0));
  } catch (e) {}
  return out;
}
function bgT2CrossBetLabel(b) {
  try {
    const k = b && b.kind;
    const game = k === 'match' ? 'Match play' : k === 'nassau' ? 'Nassau' : k === 'quota' ? 'Quota' : 'Stroke play';
    const who = (b.names || []).map(n => String(n || '').trim().split(/\s+/)[0] || n).join(' v ');
    const many = (b.names || []).length >= 3;
    const v = Number(b.value) || 0;
    let terms = String(v);
    if (k === 'stroke' || k === 'quota') terms += b.per ? (k === 'quota' ? ' per point' : ' per stroke') : ' flat';
    else if (k === 'nassau') terms += (b.segments === 'fb' ? ' a side (front & back)' : ' a side') + (many ? ' · low score takes each side' : (b.format === 'match' ? ' · match play' : ''));
    if (k !== 'quota') terms += b.net === false ? ' · gross' : ' · net';
    return { game: game, who: who, terms: terms };
  } catch (e) { return { game: 'Game', who: '', terms: '' }; }
}
// Pure: the bets for a pick of 2+ players (3+ = everyone against everyone, one bet per pair,
// same stake), or a string saying why not.
function bgT2CrossBetsBuild(o) {
  const kind = o && o.kind;
  if (['match', 'nassau', 'stroke', 'quota'].indexOf(kind) < 0) return 'Pick a game';
  const v = Number(o && o.value);
  if (!(v > 0)) return 'Enter the units';
  const names = (o && Array.isArray(o.names)) ? o.names.map(n => String(n || '').trim()).filter(Boolean) : [];
  if (names.length < 2) return 'Pick at least two players';
  const P = bgXbetPairs(names, () => null);   // no card yet: every pair is a bet
  if (!P.pairs.length) return 'Pick two different players';
  const at = Date.now();
  // Nassau with 3+ players can be ONE group Nassau: the low score on each side takes the pot from
  // everyone else (the cart's own 3+ Nassau, carried across groups by the engine's nassauGroup).
  if (kind === 'nassau' && names.length >= 3 && o.mode === 'group') {
    const uniq = []; const seen = new Set(); names.forEach(n => { const k = _t2SKey(n); if (!k || seen.has(k)) return; seen.add(k); uniq.push(n); });
    if (uniq.length < 3) return 'Pick at least three different players';
    return { bets: [{ kind: 'nassau', names: uniq, value: v, net: o.net !== false, per: false, format: 'stroke', segments: o.segments === 'fb' ? 'fb' : 'fbo', savedAt: at, by: String((o && o.by) || '') }] };
  }
  return { bets: P.pairs.map((pr, i) => ({
    kind: kind, names: [pr[0], pr[1]], value: v,
    net: kind === 'quota' ? true : (o.net !== false),
    per: (kind === 'stroke' || kind === 'quota') ? !!o.per : false,
    format: kind === 'nassau' ? (o.format === 'match' ? 'match' : 'stroke') : (kind === 'match' ? 'match' : 'stroke'),
    segments: kind === 'nassau' ? (o.segments === 'fb' ? 'fb' : 'fbo') : 'o',
    savedAt: at + i, by: String((o && o.by) || '')
  })) };
}
// Pure. At launch: an event Match / Nassau bet with BOTH players on this cart becomes the cart's
// own game at the same terms (one instance, de-duplicated on the pair). Returns how many landed.
function bgT2CrossBetsOntoCart(games, gp, bets) {
  let n = 0;
  try {
    if (!games || !Array.isArray(gp) || !Array.isArray(bets) || !bets.length) return 0;
    const K = s => _t2SKey(s);
    const byKey = {}; gp.forEach(p => { if (p && p.name) byKey[K(p.name)] = p; });
    const instOf = c => !c ? [] : ((Array.isArray(c.instances) && c.instances.length) ? c.instances : [c]);
    bets.forEach(b => {
      if (!b || b.off || (b.kind !== 'match' && b.kind !== 'nassau') || !Array.isArray(b.names) || b.names.length < 2) return;
      if (b.kind === 'match' && b.names.length !== 2) return;
      const who = b.names.map(nm => byKey[K(nm)]);
      if (who.some(p => !p) || new Set(who).size !== who.length) return;   // everyone must be on THIS cart
      const pk = who.map(p => K(p.name)).sort().join(',');
      const cur = instOf(games[b.kind]).filter(i => i && typeof i === 'object');
      if (cur.some(i => { const pr = Array.isArray(i.participantNames) ? i.participantNames : (Array.isArray(i.pair) ? i.pair : []); return pr.length === who.length && pr.map(K).sort().join(',') === pk; })) return;
      const ids = who.map(p => p.id), nms = who.map(p => p.name);
      const inst = b.kind === 'match'
        ? { value: Number(b.value) || 0, net: b.net !== false, savedAt: Number(b.savedAt) || Date.now(), fromEvent: true, participants: ids, participantNames: nms, pair: nms.slice() }
        : { value: Number(b.value) || 0, format: (who.length >= 3 || b.format !== 'match') ? 'stroke' : 'match', net: b.net !== false, allowHuckle: false, segments: b.segments === 'fb' ? 'fb' : 'fbo', birdiePay: 0, eaglePay: 0, hioPay: 0, savedAt: Number(b.savedAt) || Date.now(), fromEvent: true, participants: ids, participantNames: nms, pair: nms.slice() };
      const all = cur.concat([inst]);
      games[b.kind] = Object.assign({}, all[0], { instances: all });
      n++;
    });
  } catch (e) {}
  return n;
}
// The setup screen (hub row "Cross bets"). Commissioner / admins. Stacks above the hub.
async function openT2CrossBetsEditor(t, day, after) {
  try {
    t = t || _t2Current; if (!t || !t.id) return;
    day = Number(day) || 1;
    if (typeof t2CanManage === 'function' && !t2CanManage(t)) { showToast('Only the commissioner or an admin can set cross bets'); return; }
    const old = document.getElementById('t2-xbets-ov'); if (old) { try { old.remove(); } catch (e) {} }
    showToast('Loading players…');
    let players = [], groups = [], members = {};
    try { players = (await t2GetPlayers(t.id)) || []; } catch (e) { players = []; }
    try {
      const days = (await t2GetDays(t.id)) || [];
      const dObj = days.find(x => x.day_number === day);
      if (dObj && dObj.id) { groups = (await t2GetGroups(dObj.id)) || []; members = await t2GetMembersForGroups(groups); }
    } catch (e) { groups = []; members = {}; }
    const real = players.filter(p => !(typeof t2IsOpenSlot === 'function' && t2IsOpenSlot(p)));
    if (real.length < 2) { showToast('Add at least two players first'); return; }
    const nameOf = p => { const parts = String(p.display_name || 'Player').trim().split(/\s+/); return combineName(parts[0] || 'Player', parts.slice(1).join(' ') || ''); };
    const groupOf = {};
    groups.forEach(g => (members[g.id] || []).forEach(m => { groupOf[m.tournament_player_id] = g.group_number; }));
    const rows = real.map(p => ({ id: p.id, name: nameOf(p), group: groupOf[p.id] || null, uid: p.user_id || null }));
    rows.sort((a, b) => ((a.group || 99) - (b.group || 99)) || String(a.name).localeCompare(String(b.name)));
    const anyGroups = rows.some(r => r.group);
    const live = /live/.test(String(t.status || '').toLowerCase());
    let myName = ''; try { const me = _authUser && real.find(p => p.user_id === _authUser.id); if (me) myName = nameOf(me); } catch (e) {}
    const esc = t2esc;
    const ov = document.createElement('div');
    ov.id = 't2-xbets-ov'; ov.className = 'modal-overlay show'; ov.style.cssText = 'z-index:100070';
    const opt = (v, tx, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(tx) + '</option>';
    const lab = 'font-weight:600;display:block;margin:10px 0 4px';
    const pick = r => '<label style="display:flex;align-items:center;gap:10px;padding:8px 2px;border-top:1px solid var(--border);cursor:pointer"><input type="checkbox" class="t2xb-pl" data-name="' + esc(r.name) + '"' + (myName && r.name === myName ? ' checked' : '') + ' style="width:20px;height:20px;flex:0 0 auto"><span style="flex:1;min-width:0;white-space:normal"><span style="font-weight:600">' + esc(r.name) + '</span>' + '</span></label>';   // the group is the section heading
    const renderList = () => {
      const bets = bgT2CrossBetsFor(t, day);
      if (!bets.length) return '<div class="small-text" style="color:var(--text-muted);padding:6px 0 2px">No cross bets set for this day yet.</div>';
      return bets.map(b => { const L = bgT2CrossBetLabel(b); return '<div style="display:flex;align-items:center;gap:8px;padding:8px 2px;border-top:1px solid var(--border)"><span style="flex:1;min-width:0;white-space:normal"><span style="font-weight:600">' + esc(L.who) + '</span> <span class="small-text" style="color:var(--text-muted)">· ' + esc(L.game) + ' · ' + esc(L.terms) + '</span></span><span role="button" tabindex="0" class="t2xb-rm" data-id="' + esc(b.id) + '" title="Remove this bet" style="cursor:pointer;flex:0 0 auto;color:var(--danger);font-weight:700;padding:2px 8px">✕</span></div>'; }).join('');
    };
    let listHtml = '';
    if (anyGroups) {
      let cur = null;
      rows.forEach(r => { const gl = r.group ? ('Group ' + r.group) : 'Not in a group yet'; if (gl !== cur) { cur = gl; listHtml += '<div class="help-text" style="' + lab + '">' + esc(gl) + '</div>'; } listHtml += pick(r); });
    } else listHtml = '<div class="help-text" style="' + lab + '">Players</div>' + rows.map(pick).join('');
    ov.innerHTML = '<div class="modal" style="max-width:460px;width:94%;max-height:88vh;display:flex;flex-direction:column">' +
      '<h2 style="margin:0 0 4px">⚔️ Cross bets' + (Number(t.num_days) > 1 ? ' · Day ' + day : '') + '</h2>' +
      '<p class="help-text" style="margin:0 0 6px;white-space:normal">Games between players in different groups — Match play, Nassau, Stroke play or Quota. Tick everyone in the bet; three or more means everyone against everyone, each pair its own bet at the same stake. Scored on the holes both players finish and settled on the Event Leaderboard. A pair that ends up in the same group plays it as that group’s own game.' + (live ? ' The event is live: bets added now still count on every card.' : '') + '</p>' +
      '<div id="t2xb-scroll" style="flex:1;overflow-y:auto;min-height:120px">' +
      '<div class="help-text" style="' + lab + '">Set so far</div><div id="t2xb-list">' + renderList() + '</div>' +
      '<div class="help-text" style="font-weight:700;margin:14px 0 2px;font-size:14px">Add cross bets</div>' + listHtml +
      '<label class="help-text" for="t2xb-kind" style="' + lab + '">Game</label><select id="t2xb-kind" style="width:100%">' + opt('match', 'Match play — holes up and down', true) + opt('nassau', 'Nassau — front, back & overall', false) + opt('stroke', 'Stroke play — lower total wins', false) + opt('quota', 'Quota — most points over quota wins', false) + '</select>' +
      '<div id="t2xb-mode-wrap" style="display:none"><label class="help-text" for="t2xb-mode" style="' + lab + '">Three or more players</label><select id="t2xb-mode" style="width:100%">' + opt('group', 'One Nassau — low score takes each side from everyone', true) + opt('pairs', 'Everyone against everyone — each pair its own Nassau', false) + '</select></div>' +
      '<div id="t2xb-seg-wrap" style="display:none"><label class="help-text" for="t2xb-seg" style="' + lab + '">Sides</label><select id="t2xb-seg" style="width:100%">' + opt('fbo', 'Front, back & overall', true) + opt('fb', 'Front & back only', false) + '</select></div>' +
      '<div id="t2xb-fmt-wrap" style="display:none"><label class="help-text" for="t2xb-fmt" style="' + lab + '">Each side decided by</label><select id="t2xb-fmt" style="width:100%">' + opt('stroke', 'Stroke play (lower score on the nine)', true) + opt('match', 'Match play (holes won on the nine)', false) + '</select></div>' +
      '<div id="t2xb-net-wrap"><label class="help-text" for="t2xb-net" style="' + lab + '">Scores</label><select id="t2xb-net" style="width:100%">' + opt('net', 'Net (with handicap strokes)', true) + opt('gross', 'Gross', false) + '</select></div>' +
      '<div id="t2xb-pay-wrap" style="display:none"><label class="help-text" for="t2xb-pay" style="' + lab + '">Pays</label><select id="t2xb-pay" style="width:100%">' + opt('flat', 'Flat amount to the winner', true) + opt('per', 'Per stroke of the gap', false) + '</select></div>' +
      '<label class="help-text" for="t2xb-val" style="' + lab + '"><span id="t2xb-val-lbl">Units (each pair)</span></label><input type="number" id="t2xb-val" data-no-draft inputmode="decimal" min="0" step="1" value="5" style="width:100%">' +
      '<div id="t2xb-count" class="small-text" style="margin-top:8px;color:var(--text-muted);white-space:normal"></div></div>' +
      '<div class="actions" style="margin-top:12px"><button type="button" class="bg-btn bg-btn--ghost" id="t2xb-close">Done</button><button type="button" class="bg-btn bg-btn--primary primary" id="t2xb-save">Add</button></div></div>';
    document.body.appendChild(ov);
    const q = id => ov.querySelector('#' + id);
    const picked = () => Array.from(ov.querySelectorAll('.t2xb-pl')).filter(c => c.checked).map(c => c.getAttribute('data-name'));
    const form = () => ({ kind: q('t2xb-kind').value, names: picked(), value: q('t2xb-val').value, net: q('t2xb-net').value !== 'gross', per: q('t2xb-pay').value === 'per', format: q('t2xb-fmt').value, segments: q('t2xb-seg').value, mode: q('t2xb-mode').value, by: myName });
    const sync = () => {
      const k = q('t2xb-kind').value;
      const nPick = picked().length, grpN = k === 'nassau' && nPick >= 3 && q('t2xb-mode').value === 'group';
      q('t2xb-mode-wrap').style.display = (k === 'nassau' && nPick >= 3) ? '' : 'none';
      q('t2xb-seg-wrap').style.display = k === 'nassau' ? '' : 'none';
      q('t2xb-fmt-wrap').style.display = (k === 'nassau' && !grpN) ? '' : 'none';
      q('t2xb-net-wrap').style.display = k === 'quota' ? 'none' : '';
      q('t2xb-pay-wrap').style.display = (k === 'stroke' || k === 'quota') ? '' : 'none';
      const po = q('t2xb-pay').querySelector('option[value="per"]'); if (po) po.textContent = k === 'quota' ? 'Per point of the gap' : 'Per stroke of the gap';
      const vl = q('t2xb-val-lbl'); if (vl) vl.textContent = grpN ? 'Units a side (from each player you beat)' : (k === 'nassau' ? 'Units a side (each pair)' : 'Units (each pair)');
      const d = bgT2CrossBetsBuild(form()), c = q('t2xb-count');
      if (c) c.textContent = (typeof d === 'string') ? '' : (d.bets.length + ' bet' + (d.bets.length === 1 ? '' : 's') + ': ' + d.bets.map(b => b.names.map(n => String(n).split(/\s+/)[0]).join(' v ')).join(', '));
    };
    ov.addEventListener('change', sync); q('t2xb-val').addEventListener('input', sync); sync();
    const wireRemove = () => ov.querySelectorAll('.t2xb-rm').forEach(el => { el.onclick = async () => {
      const id = el.getAttribute('data-id'); const b = bgT2CrossBetsFor(t, day).find(x => x.id === id); if (!b) return;
      const L = bgT2CrossBetLabel(b);
      let go = false; try { go = await uiConfirm('Remove the ' + L.game + ' bet ' + L.who + '?', { title: 'Remove cross bet?', okLabel: 'Remove', cancelLabel: 'Keep', danger: true }); } catch (e) { go = false; }
      if (!go) return;
      const ok = await t2MergeSettings(t.id, s => { s.crossBets = s.crossBets || {}; const bag = s.crossBets[day] = s.crossBets[day] || {}; if (bag[id]) bag[id] = Object.assign({}, bag[id], { off: true, offAt: Date.now() }); });
      if (!ok) { showToast('Could not remove it — try again'); return; }
      try { t.settings = (_t2Current && _t2Current.id === t.id && _t2Current.settings) ? _t2Current.settings : t.settings; if (t.settings && t.settings.crossBets && t.settings.crossBets[day] && t.settings.crossBets[day][id]) t.settings.crossBets[day][id].off = true; } catch (e) {}
      q('t2xb-list').innerHTML = renderList(); wireRemove(); showToast('Cross bet removed');
    }; });
    wireRemove();
    const close = () => { try { ov.remove(); } catch (e) {} if (typeof after === 'function') { try { after(); } catch (e) {} } };
    q('t2xb-close').onclick = close;
    ov.onclick = (e) => { if (e.target === ov) close(); };
    let busy = false;
    q('t2xb-save').onclick = async () => {
      if (busy) return;
      const d = bgT2CrossBetsBuild(form());
      if (typeof d === 'string') { showToast(d); return; }
      // a pair already set for this game today stands; the new copy is skipped
      const have = new Set(bgT2CrossBetsFor(t, day).map(b => b.kind + '|' + (b.names || []).map(_t2SKey).sort().join(',')));
      let dup = 0;
      const bets = d.bets.filter(b => { const k = b.kind + '|' + b.names.map(_t2SKey).sort().join(','); if (have.has(k)) { dup++; return false; } return true; });
      if (!bets.length) { showToast('Those bets are already set for this day'); return; }
      busy = true; q('t2xb-save').disabled = true; q('t2xb-save').textContent = 'Saving…';
      const ids = bets.map((b, i) => 'xb' + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 6));
      const ok = await t2MergeSettings(t.id, s => { s.crossBets = s.crossBets || {}; const bag = s.crossBets[day] = s.crossBets[day] || {}; bets.forEach((b, i) => { bag[ids[i]] = b; }); });
      busy = false; q('t2xb-save').disabled = false; q('t2xb-save').textContent = 'Add';
      if (!ok) { showToast('Could not save — check your signal and try again'); return; }
      try { if (_t2Current && _t2Current.id === t.id && _t2Current.settings) t.settings = _t2Current.settings; else { t.settings = t.settings || {}; t.settings.crossBets = t.settings.crossBets || {}; t.settings.crossBets[day] = t.settings.crossBets[day] || {}; bets.forEach((b, i) => { t.settings.crossBets[day][ids[i]] = b; }); } } catch (e) {}
      q('t2xb-list').innerHTML = renderList(); wireRemove();
      ov.querySelectorAll('.t2xb-pl').forEach(c => { c.checked = !!(myName && c.getAttribute('data-name') === myName); }); sync();
      try { if (window._t2CrossGps) { window._t2CrossGps._sx = null; window._t2CrossGps.at = 0; } } catch (e) {}
      showToast(bets.length + ' cross bet' + (bets.length === 1 ? '' : 's') + ' saved ✓' + (dup ? (' (' + dup + ' already set)') : ''));
      try { q('t2xb-scroll').scrollTop = 0; } catch (e) {}
    };
    try { if (typeof bgKeyboardSafe === 'function') bgKeyboardSafe(q('t2xb-scroll')); } catch (e) {}
  } catch (e) { try { console.error('cross bets editor', e); } catch (e2) {} showToast('Could not open Cross bets'); }
}
try { window.bgT2CrossBetsFor = bgT2CrossBetsFor; window.bgT2CrossBetsBuild = bgT2CrossBetsBuild; window.bgT2CrossBetsOntoCart = bgT2CrossBetsOntoCart; window.openT2CrossBetsEditor = openT2CrossBetsEditor; } catch (e) {}
