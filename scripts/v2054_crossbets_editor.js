// The Cross bets screen. v2053: the hub row (commissioner / admins). v2054 (Tyler 11/20: "we also need to be
// able to setup a cross bet when inside our group so we don't have to go back out or reach out to the
// commissioner"): ONE screen everywhere -- the hub row, "Your group's games", and the live card's banner --
// saved through bg_t2_crossbets_add / bg_t2_crossbets_remove (SECURITY DEFINER: a player may set bets he is
// in, a manager any bet; the setter may remove his own until his round is finished, a manager any time).
// Falls back to t2MergeSettings for a manager when the RPC is missing. opts: { from:'hub'|'group'|'card' }.
async function openT2CrossBetsEditor(t, day, after, opts) {
  try {
    t = t || _t2Current; if (!t || !t.id) return;
    day = Number(day) || 1;
    const mgr = !!(typeof t2CanManage === 'function' && t2CanManage(t));
    const meUid = (typeof _authUser !== 'undefined' && _authUser && _authUser.id) || null;
    if (!mgr && !meUid) { showToast('Sign in to set a cross bet'); return; }
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
    let myName = ''; try { const me = meUid && real.find(p => p.user_id === meUid); if (me) myName = nameOf(me); } catch (e) {}
    if (!mgr && !myName) { showToast('You’re not on this event’s roster, so you can’t set a cross bet here'); return; }
    const myKey = myName ? _t2SKey(myName) : '';
    const esc = t2esc;
    const ov = document.createElement('div');
    ov.id = 't2-xbets-ov'; ov.className = 'modal-overlay show'; ov.style.cssText = 'z-index:100070';
    const opt = (v, tx, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(tx) + '</option>';
    const lab = 'font-weight:600;display:block;margin:10px 0 4px';
    const pick = r => '<label style="display:flex;align-items:center;gap:10px;padding:8px 2px;border-top:1px solid var(--border);cursor:pointer"><input type="checkbox" class="t2xb-pl" data-name="' + esc(r.name) + '"' + (myName && r.name === myName ? ' checked' : '') + ' style="width:20px;height:20px;flex:0 0 auto"><span style="flex:1;min-width:0;white-space:normal"><span style="font-weight:600">' + esc(r.name) + '</span>' + (myName && r.name === myName ? ' <span class="small-text" style="color:var(--text-muted)">· you</span>' : '') + '</span></label>';
    const canRemove = b => mgr || (!!meUid && b && b.byUid === meUid);
    const renderList = () => {
      const bets = bgT2CrossBetsFor(t, day);
      if (!bets.length) return '<div class="small-text" style="color:var(--text-muted);padding:6px 0 2px">No cross bets set for this day yet.</div>';
      return bets.map(b => { const L = bgT2CrossBetLabel(b); return '<div style="display:flex;align-items:center;gap:8px;padding:8px 2px;border-top:1px solid var(--border)"><span style="flex:1;min-width:0;white-space:normal"><span style="font-weight:600">' + esc(L.who) + '</span> <span class="small-text" style="color:var(--text-muted)">· ' + esc(L.game) + ' · ' + esc(L.terms) + (b.by ? ' · set by ' + esc(String(b.by).split(/\s+/)[0]) : '') + '</span></span>' + (canRemove(b) ? '<span role="button" tabindex="0" class="t2xb-rm" data-id="' + esc(b.id) + '" title="Remove this bet" style="cursor:pointer;flex:0 0 auto;color:var(--danger);font-weight:700;padding:2px 8px">✕</span>' : '') + '</div>'; }).join('');
    };
    let listHtml = '';
    if (anyGroups) {
      let cur = null;
      rows.forEach(r => { const gl = r.group ? ('Group ' + r.group) : 'Not in a group yet'; if (gl !== cur) { cur = gl; listHtml += '<div class="help-text" style="' + lab + '">' + esc(gl) + '</div>'; } listHtml += pick(r); });
    } else listHtml = '<div class="help-text" style="' + lab + '">Players</div>' + rows.map(pick).join('');
    const intro = mgr
      ? 'Games between players in different groups — Match play, Nassau, Stroke play or Quota. Tick everyone in the bet; three or more means everyone against everyone, each pair its own bet at the same stake. Scored on the holes both players finish and settled on the Event Leaderboard. A pair that ends up in the same group plays it as that group’s own game.'
      : 'Games between you and players in other groups — Match play, Nassau, Stroke play or Quota. Tick who you’re playing; three or more means a bet with each of them (or one group Nassau). Scored on the holes you both finish and settled on the Event Leaderboard. You can remove a bet you set until your round is finished.';
    ov.innerHTML = '<div class="modal" style="max-width:460px;width:94%;max-height:88vh;display:flex;flex-direction:column;position:relative">' +
      '<button type="button" class="bg-btn bg-btn--ghost bg-btn--icon" id="t2xb-x" aria-label="Close" style="position:absolute;top:10px;right:12px;line-height:1">✕</button>' +
      '<h2 style="margin:0 30px 4px 0">⚔️ Cross bets' + (Number(t.num_days) > 1 ? ' · Day ' + day : '') + '</h2>' +
      '<p class="help-text" style="margin:0 0 6px;white-space:normal">' + intro + (live && mgr ? ' The event is live: bets added now still count on every card.' : '') + '</p>' +
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
      '<div class="actions" style="margin-top:12px"><button type="button" class="bg-btn bg-btn--ghost" id="t2xb-close">Cancel</button><button type="button" class="bg-btn bg-btn--primary primary" id="t2xb-save">Add bets</button></div></div>';
    document.body.appendChild(ov);
    const q = id => ov.querySelector('#' + id);
    const picked = () => Array.from(ov.querySelectorAll('.t2xb-pl')).filter(c => c.checked).map(c => c.getAttribute('data-name'));
    const form = () => ({ kind: q('t2xb-kind').value, names: picked(), value: q('t2xb-val').value, net: q('t2xb-net').value !== 'gross', per: q('t2xb-pay').value === 'per', format: q('t2xb-fmt').value, segments: q('t2xb-seg').value, mode: q('t2xb-mode').value, by: myName, mustInclude: mgr ? '' : myKey });
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
      const d = bgT2CrossBetsBuild(form()), c = q('t2xb-count'), sb = q('t2xb-save');
      const n = (typeof d === 'string') ? 0 : d.bets.length;
      if (c) c.textContent = (typeof d === 'string') ? (nPick ? d : '') : (n + ' bet' + (n === 1 ? '' : 's') + ': ' + d.bets.map(b => b.names.map(x => String(x).split(/\s+/)[0]).join(' v ')).join(', ') + (d.skipped && d.skipped.length ? ('. Not included (you’re not in them): ' + d.skipped.map(pr => pr.map(x => String(x).split(/\s+/)[0]).join(' v ')).join(', ')) : ''));
      if (sb) { sb.textContent = n ? ('Add ' + n + ' bet' + (n === 1 ? '' : 's')) : 'Add bets'; sb.disabled = !n; }
    };
    ov.addEventListener('change', sync); q('t2xb-val').addEventListener('input', sync); sync();
    const mirror = (bag) => {   // keep the in-memory event in step with what the server now holds
      try {
        t.settings = t.settings || {}; t.settings.crossBets = t.settings.crossBets || {}; t.settings.crossBets[day] = Object.assign({}, t.settings.crossBets[day] || {}, bag || {});
        if (_t2Current && _t2Current.id === t.id && _t2Current !== t) { _t2Current.settings = _t2Current.settings || {}; _t2Current.settings.crossBets = _t2Current.settings.crossBets || {}; _t2Current.settings.crossBets[day] = Object.assign({}, _t2Current.settings.crossBets[day] || {}, bag || {}); }
        if (window._t2CrossGps && window._t2CrossGps.t && window._t2CrossGps.t.id === t.id) { window._t2CrossGps.t.settings = window._t2CrossGps.t.settings || {}; window._t2CrossGps.t.settings.crossBets = window._t2CrossGps.t.settings.crossBets || {}; window._t2CrossGps.t.settings.crossBets[day] = Object.assign({}, window._t2CrossGps.t.settings.crossBets[day] || {}, bag || {}); window._t2CrossGps._sx = null; }
      } catch (e) {}
      try { if (typeof state !== 'undefined' && state && state.game && state.game.t2 && state.game.t2.tournamentId === t.id) { if (typeof renderGameBanners === 'function') renderGameBanners(); if (typeof updateGpsMoneyMatch === 'function') updateGpsMoneyMatch(); } } catch (e) {}
    };
    const wireRemove = () => ov.querySelectorAll('.t2xb-rm').forEach(el => { el.onclick = async () => {
      const id = el.getAttribute('data-id'); const b = bgT2CrossBetsFor(t, day).find(x => x.id === id); if (!b) return;
      const L = bgT2CrossBetLabel(b);
      let go = false; try { go = await uiConfirm('Remove the ' + L.game + ' bet ' + L.who + '?', { title: 'Remove cross bet?', okLabel: 'Remove', cancelLabel: 'Keep', danger: true }); } catch (e) { go = false; }
      if (!go) return;
      let ok = false, why = '';
      try {
        const r = await supa.rpc('bg_t2_crossbets_remove', { p_tid: t.id, p_day: day, p_id: id });
        if (r && !r.error && r.data && r.data.ok) ok = true;
        else if (r && r.error && typeof _bgRpcMissing === 'function' && _bgRpcMissing(r.error) && mgr) ok = await t2MergeSettings(t.id, s => { s.crossBets = s.crossBets || {}; const bag = s.crossBets[day] = s.crossBets[day] || {}; if (bag[id]) bag[id] = Object.assign({}, bag[id], { off: true, offAt: Date.now() }); });
        else why = (r && r.data && r.data.reason) || (r && r.error && r.error.message) || '';
      } catch (e) { ok = false; }
      if (!ok) { showToast(why === 'round_finished' ? 'Your round is finished — ask the commissioner to remove it' : why === 'not_yours' ? 'Only whoever set this bet (or the commissioner) can remove it' : 'Could not remove it — try again'); return; }
      mirror({ [id]: Object.assign({}, b, { off: true, offAt: Date.now() }) });
      q('t2xb-list').innerHTML = renderList(); wireRemove(); showToast('Cross bet removed');
    }; });
    wireRemove();
    const close = () => { try { ov.remove(); } catch (e) {} if (typeof after === 'function') { try { after(); } catch (e) {} } };
    q('t2xb-close').onclick = close; q('t2xb-x').onclick = close;
    ov.onclick = (e) => { if (e.target === ov) close(); };
    let busy = false;
    q('t2xb-save').onclick = async () => {
      if (busy) return;
      const d = bgT2CrossBetsBuild(form());
      if (typeof d === 'string') { showToast(d); return; }
      const have = new Set(bgT2CrossBetsFor(t, day).map(b => b.kind + '|' + (b.names || []).map(_t2SKey).sort().join(',')));
      let dup = 0;
      const bets = d.bets.filter(b => { const k = b.kind + '|' + b.names.map(_t2SKey).sort().join(','); if (have.has(k)) { dup++; return false; } return true; });
      if (!bets.length) { showToast('Those bets are already set for this day'); return; }
      busy = true; q('t2xb-save').disabled = true; q('t2xb-save').textContent = 'Saving…';
      let ok = false, saved = null, why = '';
      try {
        const r = await supa.rpc('bg_t2_crossbets_add', { p_tid: t.id, p_day: day, p_bets: bets });
        if (r && !r.error && r.data && r.data.ok) { ok = true; saved = r.data.bets || {}; const sk = (r.data.skipped || []).filter(x => x && x.reason === 'already_set').length; dup += sk; if (!Object.keys(saved).length && !sk) why = ((r.data.skipped || [])[0] || {}).reason || 'nothing'; }
        else if (r && r.error && typeof _bgRpcMissing === 'function' && _bgRpcMissing(r.error) && mgr) {
          const ids = bets.map((b, i) => 'xb' + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 6));
          ok = await t2MergeSettings(t.id, s => { s.crossBets = s.crossBets || {}; const bag = s.crossBets[day] = s.crossBets[day] || {}; bets.forEach((b, i) => { bag[ids[i]] = b; }); });
          if (ok) { saved = {}; bets.forEach((b, i) => { saved[ids[i]] = b; }); }
        } else why = (r && r.data && r.data.reason) || (r && r.error && r.error.message) || '';
      } catch (e) { ok = false; }
      busy = false; sync();
      if (!ok || why) {
        const msg = why === 'not_in_bet' ? 'You can only set a bet you’re in — tick yourself' : why === 'not_in_field' ? 'Someone in that bet isn’t on this event’s roster' : why === 'not_allowed' ? 'Only players in this event can set a cross bet' : 'Could not save — check your signal and try again';
        showToast(msg); return;
      }
      mirror(saved);
      q('t2xb-list').innerHTML = renderList(); wireRemove();
      ov.querySelectorAll('.t2xb-pl').forEach(c => { c.checked = !!(myName && c.getAttribute('data-name') === myName); }); sync();
      try { if (window._t2CrossGps) { window._t2CrossGps._sx = null; window._t2CrossGps.at = 0; } } catch (e) {}
      const n = Object.keys(saved || {}).length;
      showToast(n + ' cross bet' + (n === 1 ? '' : 's') + ' saved ✓' + (dup ? (' (' + dup + ' already set)') : ''));
      try { q('t2xb-scroll').scrollTop = 0; } catch (e) {}
    };
    try { if (typeof bgKeyboardSafe === 'function') bgKeyboardSafe(q('t2xb-scroll')); } catch (e) {}
  } catch (e) { try { console.error('cross bets editor', e); } catch (e2) {} showToast('Could not open Cross bets'); }
}
// v2054: open the Cross bets screen for the event a round belongs to (the live card, a group's games screen).
async function bgT2OpenCrossBetsFor(tid, day, after, opts) {
  try {
    if (!tid) return;
    let t = (_t2Current && _t2Current.id === tid) ? _t2Current : null;
    if (!t) { try { t = await t2Get(tid); } catch (e) { t = null; } }
    if (!t) { showToast('Could not load the event'); return; }
    return openT2CrossBetsEditor(t, day || 1, after, opts);
  } catch (e) {}
}
try { window.bgT2CrossBetsFor = bgT2CrossBetsFor; window.bgT2CrossBetsBuild = bgT2CrossBetsBuild; window.bgT2CrossBetsOntoCart = bgT2CrossBetsOntoCart; window.openT2CrossBetsEditor = openT2CrossBetsEditor; window.bgT2OpenCrossBetsFor = bgT2OpenCrossBetsFor; } catch (e) {}
