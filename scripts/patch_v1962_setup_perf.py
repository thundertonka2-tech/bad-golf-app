#!/usr/bin/env python3
"""v1962 — tournament setup responsiveness: optimistic player-picker ticks, cheaper adds,
one bulk members read + skipped dead work on the Groups screen, commissioner scorekeeper on the
auto-build path too."""
import sys

EDITS = []

# ── A. player picker: tick at once, repaint one row, cache handicaps, debounce search ──
EDITS.append((
"""  const pending = new Set();   // name keys with a save in flight
  let list = [];
  const _rebuild = () => {
    const seen = new Set(); list = [];
    (roster || []).forEach(r => { if (r && r.name && !seen.has(K(r.name))) { seen.add(K(r.name)); list.push(r); } });
    real().forEach(p => { if (p.display_name && !seen.has(K(p.display_name))) { seen.add(K(p.display_name)); list.push({ name: p.display_name, handicap: p.handicap, _evOnly: true }); } });
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };""",
"""  const pending = new Set();   // name keys with a save in flight
  const wanted = new Map();    // v1962: what the tap asked for (true = in), shown at once
  let list = [];
  const _rebuild = () => {
    const seen = new Set(); list = [];
    (roster || []).forEach(r => { if (r && r.name && !seen.has(K(r.name))) { seen.add(K(r.name)); list.push(r); } });
    real().forEach(p => { if (p.display_name && !seen.has(K(p.display_name))) { seen.add(K(p.display_name)); list.push({ name: p.display_name, handicap: p.handicap, _evOnly: true }); } });
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    // v1962 PERF: the roster handicap (a sort of each player's score history) was recomputed
    // for every row on every paint -- and every tap painted twice. Once per rebuild now.
    list.forEach(r => { try { r._rh = t2RosterHcp(r); } catch (e) { r._rh = null; } });
  };""",
"A1 rebuild"))

EDITS.append((
"""  const rowHtml = (arr) => arr.length ? arr.map(r => {
    const ev = inEvent(r.name);
    const h = ev && ev.handicap != null ? bgHcpNum(ev.handicap) : t2RosterHcp(r);
    const busy = pending.has(K(r.name));
    return '<div class="t2ap-row' + (busy ? ' is-busy' : '') + '" data-name="' + t2esc(r.name) + '" data-hcp="' + (h != null ? h : '') + '" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 2px;border-top:1px solid var(--border)">' +
      crewAvatarHtml(r, false) +
      '<div style="flex:1;min-width:0;overflow:hidden"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">' + t2esc(r.name) + guestPillHtml(r.name, r) + testPillHtml(r.name) + (h != null && h !== '' ? ' <span class="small-text" style="color:var(--text-muted)">(HCP ' + h + ')</span>' : '') + '</div></div>' +
      checkHtml(!!ev) + '</div>';
  }).join('') : (_loading ? '<div class="help-text" style="padding:8px 2px">Loading players…</div>' : '<div class="help-text" style="padding:8px 2px">No one matches — use “+ Guest”.</div>');""",
"""  // v1962: a pending tap shows what it asked for, not what the database has so far.
  const isOn = (name) => { const k = K(name); return pending.has(k) && wanted.has(k) ? !!wanted.get(k) : !!inEvent(name); };
  const rowHtml = (arr) => arr.length ? arr.map(r => {
    const ev = inEvent(r.name);
    const h = ev && ev.handicap != null ? bgHcpNum(ev.handicap) : (r._rh !== undefined ? r._rh : t2RosterHcp(r));
    const busy = pending.has(K(r.name));
    return '<div class="t2ap-row' + (busy ? ' is-busy' : '') + '" data-name="' + t2esc(r.name) + '" data-hcp="' + (h != null ? h : '') + '" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 2px;border-top:1px solid var(--border)">' +
      crewAvatarHtml(r, false) +
      '<div style="flex:1;min-width:0;overflow:hidden"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">' + t2esc(r.name) + guestPillHtml(r.name, r) + testPillHtml(r.name) + (h != null && h !== '' ? ' <span class="small-text" style="color:var(--text-muted)">(HCP ' + h + ')</span>' : '') + '</div></div>' +
      checkHtml(isOn(r.name)) + '</div>';
  }).join('') : (_loading ? '<div class="help-text" style="padding:8px 2px">Loading players…</div>' : '<div class="help-text" style="padding:8px 2px">No one matches — use “+ Guest”.</div>');
  // v1962: repaint ONE row (the tapped one) instead of the whole list.
  const paintRow = (name) => {
    try {
      const k = K(name);
      const row = Array.from(rowsEl.querySelectorAll('.t2ap-row')).find(el => K(el.getAttribute('data-name')) === k);
      if (!row) return;
      row.classList.toggle('is-busy', pending.has(k));
      const old = row.querySelector('.t2ap-check'); if (old) old.outerHTML = checkHtml(isOn(name));
    } catch (e) {}
  };""",
"A2 rowHtml + paintRow"))

EDITS.append((
"""  const paintCount = () => { const n = real().length; countEl.textContent = '👥 ' + n + ' player' + (n === 1 ? '' : 's'); };""",
"""  const paintCount = () => {
    // v1962: count what the taps asked for, so the pill moves with the finger.
    let n = real().length;
    try { pending.forEach(k => { const inDb = !!real().find(p => K(p.display_name) === k); const want = !!wanted.get(k); if (want && !inDb) n++; else if (!want && inDb) n--; }); } catch (e) {}
    countEl.textContent = '👥 ' + n + ' player' + (n === 1 ? '' : 's');
  };""",
"A3 count"))

EDITS.append((
"""  const toggle = (name, hv) => {
    const k = K(name); if (pending.has(k)) return;
    const adding = !inEvent(name);
    pending.add(k); paint();
    enqueue(async () => {
      const ok = adding ? await addOne(name, hv) : await removeOne(name);
      pending.delete(k);
      if (!ok) showToast(adding ? ('Couldn’t add ' + name + ' — try again') : (window._bgRemoveCancelled ? 'Kept in the event' : ('Couldn’t take ' + name + ' off — try again')));
      if (document.body.contains(ov)) { _rebuild(); paint(); }
    });
  };""",
"""  const toggle = (name, hv) => {
    const k = K(name); if (pending.has(k)) return;
    const adding = !inEvent(name);
    pending.add(k); wanted.set(k, adding); paintRow(name); paintCount();   // v1962: ticks now, saves behind
    enqueue(async () => {
      const ok = adding ? await addOne(name, hv) : await removeOne(name);
      pending.delete(k); wanted.delete(k);
      if (!ok) showToast(adding ? ('Couldn’t add ' + name + ' — try again') : (window._bgRemoveCancelled ? 'Kept in the event' : ('Couldn’t take ' + name + ' off — try again')));
      if (document.body.contains(ov)) { if (ok) { paintRow(name); paintCount(); } else { _rebuild(); paint(); } }
    });
  };""",
"A4 toggle"))

EDITS.append((
"""  const search = ov.querySelector('#t2ap-search'); if (search) search.oninput = paint;""",
"""  { const search = ov.querySelector('#t2ap-search'); let _st = null; if (search) search.oninput = () => { clearTimeout(_st); _st = setTimeout(paint, 120); }; }   // v1962: debounced""",
"A5 search debounce"))

# ── B. adds: don't wait on a tournament read just to learn the event isn't live ──
EDITS.append((
"""async function _t2NotifyAdded(tid, uid) {
  try {
    if (!uid || (_authUser && uid === _authUser.id)) return;
    const _tt = await t2Get(tid);""",
"""async function _t2NotifyAdded(tid, uid) {
  try {
    if (!uid || (_authUser && uid === _authUser.id)) return;
    // v1962 PERF: during setup the event on screen already says it isn't live -- no read.
    try { const _c = (typeof _t2Current !== 'undefined') ? _t2Current : null; if (_c && String(_c.id) === String(tid) && String(_c.status || '') !== 'live') return; } catch (e) {}
    const _tt = await t2Get(tid);""",
"B1 notify short-circuit"))

# ── C. Groups screen: parallel reads, one members query, no prune on an empty day, link in background ──
EDITS.append((
"""    const players = await t2GetPlayers(t.id);
    const pById = {}; players.forEach(p => pById[p.id] = p);
    let groups = await t2GetGroups(dayId);
    const membersByGroup = {};
    await Promise.all(groups.map(async g => { membersByGroup[g.id] = await t2GetGroupMembers(g.id); }));""",
"""    // v1962 PERF (Tyler: "when I click groups it took several seconds to pop up"): players
    // and groups in one wave, every group's members in ONE read.
    const [players, _groups0] = await Promise.all([t2GetPlayers(t.id), t2GetGroups(dayId)]);
    const pById = {}; players.forEach(p => pById[p.id] = p);
    let groups = _groups0 || [];
    const membersByGroup = await t2GetMembersForGroups(groups);""",
"C1 carts render reads"))

EDITS.append((
"""async function t2GetGroupMembers(groupId, opts) {""",
"""// v1962: every group's members in one query (was one read per group).
async function t2GetMembersForGroups(groups, opts) {
  const out = {}; (groups || []).forEach(g => { if (g && g.id) out[g.id] = []; });
  const ids = Object.keys(out); if (!ids.length) return out;
  try {
    const rows = await _bgReadList(() => supa.from('tournament_group_members').select('*').in('group_id', ids), 't2GetMembersForGroups', opts);
    (rows || []).forEach(m => { if (m && out[m.group_id]) out[m.group_id].push(m); });
    return out;
  } catch (e) {
    await Promise.all(ids.map(async id => { try { out[id] = await t2GetGroupMembers(id, opts); } catch (e2) { out[id] = []; } }));
    return out;
  }
}
async function t2GetGroupMembers(groupId, opts) {""",
"C2 bulk members helper"))

EDITS.append((
"""async function t2ClearGroups(dayId) {
  try {
    const { error } = await supa.from('tournament_groups').delete().eq('day_id', dayId);
    if (error) { console.warn('t2ClearGroups', error); return false; }
    // v1134: the pre-read that taken the doomed ids is gone — see
    // _t2PruneGroupGames. Reconcile against what survived instead of guessing.
    try {
      const _t = (typeof _t2Current !== 'undefined') ? _t2Current : null;
      if (_t && _t.id) await _t2PruneGroupGames(_t.id);
    } catch (e) {}
    return true;
  }""",
"""async function t2ClearGroups(dayId, opts) {
  try {
    const { error } = await supa.from('tournament_groups').delete().eq('day_id', dayId);
    if (error) { console.warn('t2ClearGroups', error); return false; }
    // v1134: the pre-read that taken the doomed ids is gone — see
    // _t2PruneGroupGames. Reconcile against what survived instead of guessing.
    // v1962 PERF: a day that had no groups has nothing to prune (opts.hadNone) -- that
    // was 4+ serial round trips on every first open of the Groups screen.
    try {
      const _t = (typeof _t2Current !== 'undefined') ? _t2Current : null;
      if (_t && _t.id && !(opts && opts.hadNone)) await _t2PruneGroupGames(_t.id);
    } catch (e) {}
    return true;
  }""",
"C3 clear groups skip prune"))

EDITS.append((
"""  if (!(await t2ClearGroups(dayId))) { showToast('Could not clear the old carts — nothing was changed'); return false; }
  // v1137: building the carts is the moment a name-only slot becomes a real
  // participant, so re-try linking those rows to accounts before they are written
  // in. Best-effort, never blocking — see _t2LinkNameOnlySlots.
  try { const _tid = (typeof _t2Current !== 'undefined' && _t2Current) ? _t2Current.id : null; if (_tid) await _t2LinkNameOnlySlots(_tid); } catch (e) {}
  // v986 (T46): two inserts total instead of ~250 sequential round-trips.
  const _made = await t2CreateGroupsBulk(dayId, groups.map((g, gi) => ({ groupNumber: gi + 1, size: g.length })));""",
"""  if (!(await t2ClearGroups(dayId, { hadNone: !_hadGroups }))) { showToast('Could not clear the old carts — nothing was changed'); return false; }
  // v1137: building the carts is the moment a name-only slot becomes a real
  // participant, so re-try linking those rows to accounts. Best-effort.
  // v1962 PERF: in the background -- it is a per-player serial lookup chain and the carts
  // don't depend on it (the member rows are keyed by tournament_player id, not account).
  try { const _tid = (typeof _t2Current !== 'undefined' && _t2Current) ? _t2Current.id : null; if (_tid) _t2LinkNameOnlySlots(_tid).catch(() => {}); } catch (e) {}
  // v986 (T46): two inserts total instead of ~250 sequential round-trips.
  const _made = await t2CreateGroupsBulk(dayId, groups.map((g, gi) => ({ groupNumber: gi + 1, size: g.length })));""",
"C4 build: no-prune + background link"))

EDITS.append((
"""  {
    let _existing = [];
    try { _existing = await t2GetGroups(dayId); } catch (e) { _existing = []; }
    const _live = _existing.filter(g => g && g.game_code);
    let _dayActive = false;
    try {
      const _ds = await t2GetDays(t.id);
      const _d = (_ds || []).find(x => x && x.id === dayId);
      _dayActive = !!(_d && /^(active|live|complete|completed|final)$/i.test(String(_d.status || '')));
    } catch (e) {}""",
"""  let _hadGroups = false;
  {
    let _existing = [], _ds = [];
    try { [_existing, _ds] = await Promise.all([t2GetGroups(dayId).catch(() => []), t2GetDays(t.id).catch(() => [])]); } catch (e) { _existing = []; _ds = []; }   // v1962: one wave
    _hadGroups = !!(_existing && _existing.length);
    const _live = _existing.filter(g => g && g.game_code);
    let _dayActive = false;
    try {
      const _d = (_ds || []).find(x => x && x.id === dayId);
      _dayActive = !!(_d && /^(active|live|complete|completed|final)$/i.test(String(_d.status || '')));
    } catch (e) {}""",
"C5 build: parallel pre-reads"))

# commissioner scorekeeper on the auto-build path (v1960 only covered t2BuildGroupsForDay)
EDITS.append((
"""  showToast(byHcp ? 'Groups balanced by handicap ⚖️' : 'Groups built — tap again to reshuffle');
  return true;
}
""",
"""  // v1960/v1962: the commissioner is the scorekeeper of his own cart by default (this is
  // the auto-build the Groups screen runs on first open; v1960 only covered the wizard's builder).
  try {
    const _me = (typeof _authUser !== 'undefined' && _authUser) ? String(_authUser.id) : '';
    if (_me && _made && t2CanManage(t)) {
      for (let gi = 0; gi < groups.length; gi++) {
        const g = _made[gi]; if (!g) continue;
        const mine = groups[gi].find(p => p && p.user_id && String(p.user_id) === _me);
        if (mine && mine.display_name) { await t2SetGroupCaptain(g.id, mine.display_name); break; }
      }
    }
  } catch (e) {}
  showToast(byHcp ? 'Groups balanced by handicap ⚖️' : 'Groups built — tap again to reshuffle');
  return true;
}
""",
"C6 default scorekeeper on auto-build"))

# ── D. quick-setup checklist: members in one read ──
EDITS.append((
"""async function bgT2QuickChecklist(t, days, players) {""",
"""async function bgT2QuickChecklist(t, days, players) {   // v1962: see the members read below""",
"D0 marker"))

# ── E. Configure Day: the event prize-pool tiles get an inline player picker ──
EDITS.append((
"""    Object.keys(_TPOT_MAP).forEach(id => wire(id, sp[_TPOT_MAP[id]]));
    wire('longputt', st.tourneyLongPutt);""",
"""    Object.keys(_TPOT_MAP).forEach(id => wire(id, sp[_TPOT_MAP[id]]));
    /* v1962 (Tyler, 10/26): "The player selector is missing from all the pool games in
       tournament setup." The event prize pools (Low Net / Most GIRs / Fewest Putts / Long
       Putt / Skins) kept their who's-in list on a separate hub row. Same chip picker as every
       other game now, inside each tile, saved with the tile (everyone ticked = no list). */
    try { _tpotPickerPaint('lownet', sp.lowNet); _tpotPickerPaint('girs', sp.girs); _tpotPickerPaint('putts', sp.putts); _tpotPickerPaint('longputt', st.tourneyLongPutt); _tpotPickerPaint('skins', st.tourneySkins); } catch (e) {}
    wire('longputt', st.tourneyLongPutt);""",
"E1 paint pickers on sync"))

EDITS.append((
"""let _tpSaveT = null;
function _saveTourneyPotTiles() {""",
"""// v1962: the event prize-pool tile picker. state._tpotPlayers[id] = Set of names IN the pool.
const _TPOT_LABEL = { lownet: 'Low Net Pool', girs: 'GIR Pool', putts: 'Fewest Putts Pool', longputt: 'Long Putt Pool', skins: 'Skins' };
function _tpotRoster() {
  try { return (state._t2DayPlayers || []).map(p => p && (p.display_name || p.name)).filter(Boolean); } catch (e) { return []; }
}
function _tpotPickerPaint(id, cfg) {
  const panel = document.getElementById('opts-tpot-' + id); if (!panel) return;
  const roster = _tpotRoster();
  if (!state._tpotPlayers) state._tpotPlayers = {};
  if (!state._tpotPlayers[id]) {
    const nk = s => _t2NameKey(s);
    const pl = (cfg && Array.isArray(cfg.players) && cfg.players.length) ? new Set(cfg.players.map(nk)) : null;
    state._tpotPlayers[id] = new Set(roster.filter(n => !pl || pl.has(nk(n))));
  }
  const set = state._tpotPlayers[id];
  let picker = panel.querySelector('.participant-picker.tpot-picker');
  if (!picker) { picker = document.createElement('div'); picker.className = 'participant-picker tpot-picker'; panel.appendChild(picker); }
  const count = roster.filter(n => set.has(n)).length;
  const allSel = roster.length > 0 && count === roster.length;
  const warn = count === 0 ? ' <span class="pp-warn">— pick at least 2</span>' : (count < 2 ? ' <span class="pp-warn">— need 1 more</span>' : ' ✓');
  let html = '<div class="pp-label">' + (_TPOT_LABEL[id] || 'Pool') + ' participants (' + count + ' selected)' + warn + ' <button type="button" class="bg-btn bg-btn--primary pp-selectall" style="margin-left:6px;vertical-align:middle">' + (allSel ? 'Clear all' : 'Select all') + '</button></div><div class="pp-chips">';
  if (!roster.length) html += '<div class="small-text" style="padding:4px">Add players first.</div>';
  else roster.forEach(n => { html += bgPickerChipHtml(n, set.has(n), 'data-tpot="' + id + '" data-name="' + escAttr(n) + '"'); });
  html += '</div>';
  picker.innerHTML = html;
  picker.querySelectorAll('.participant-chip').forEach(chip => {
    chip.onclick = () => { const n = chip.dataset.name; if (set.has(n)) set.delete(n); else set.add(n); _tpotPickerPaint(id, cfg); _saveTourneyPotTiles(); };
  });
  const sa = picker.querySelector('.pp-selectall');
  if (sa) sa.onclick = () => { if (allSel) set.clear(); else roster.forEach(n => set.add(n)); _tpotPickerPaint(id, cfg); _saveTourneyPotTiles(); };
}
// null = everyone (no list stored); otherwise the picked names.
function _tpotPlayersOut(id) {
  try {
    const set = state._tpotPlayers && state._tpotPlayers[id]; if (!set) return undefined;   // untouched: keep what is stored
    const roster = _tpotRoster(); const picked = roster.filter(n => set.has(n));
    return (roster.length && picked.length === roster.length) ? null : picked;
  } catch (e) { return undefined; }
}
let _tpSaveT = null;
function _saveTourneyPotTiles() {""",
"E2 picker functions"))

EDITS.append((
"""        const _keep = (id, key) => { const o = read(id); const pl = _prevSP[key] && _prevSP[key].players; if (pl && pl.length) o.players = pl.slice(); return o; };""",
"""        const _keep = (id, key) => {
          const o = read(id);
          const pick = _tpotPlayersOut(id);   // v1962: the tile's own picker
          if (pick === undefined) { const pl = _prevSP[key] && _prevSP[key].players; if (pl && pl.length) o.players = pl.slice(); }
          else if (pick) o.players = pick.slice();
          return o;
        };
        const _lpPick = _tpotPlayersOut('longputt'), _skPick = _tpotPlayersOut('skins');
        const _withPick = (obj, pick) => { if (pick === undefined) return obj; if (pick) obj.players = pick.slice(); else delete obj.players; return obj; };""",
"E3 keep"))

EDITS.append((
"""          if (hasLp) s.tourneyLongPutt = Object.assign({ mode: 'buyin' }, s.tourneyLongPutt, { on: lpOut.on, value: lpOut.value });
          if (hasSk) s.tourneySkins = Object.assign({ mode: 'buyin' }, s.tourneySkins, { on: skOut.on, value: skOut.value, hcpPct: skHcp, ties: skTies });
        });""",
"""          if (hasLp) s.tourneyLongPutt = _withPick(Object.assign({ mode: 'buyin' }, s.tourneyLongPutt, { on: lpOut.on, value: lpOut.value }), _lpPick);
          if (hasSk) s.tourneySkins = _withPick(Object.assign({ mode: 'buyin' }, s.tourneySkins, { on: skOut.on, value: skOut.value, hcpPct: skHcp, ties: skTies }), _skPick);
        });""",
"E4 merge"))

EDITS.append((
"""            if (hasLp) _t2Current.settings.tourneyLongPutt = Object.assign({ mode: 'buyin' }, _t2Current.settings.tourneyLongPutt, { on: lpOut.on, value: lpOut.value });
            if (hasSk) _t2Current.settings.tourneySkins = Object.assign({ mode: 'buyin' }, _t2Current.settings.tourneySkins, { on: skOut.on, value: skOut.value, hcpPct: skHcp, ties: skTies });""",
"""            if (hasLp) _t2Current.settings.tourneyLongPutt = _withPick(Object.assign({ mode: 'buyin' }, _t2Current.settings.tourneyLongPutt, { on: lpOut.on, value: lpOut.value }), _lpPick);
            if (hasSk) _t2Current.settings.tourneySkins = _withPick(Object.assign({ mode: 'buyin' }, _t2Current.settings.tourneySkins, { on: skOut.on, value: skOut.value, hcpPct: skHcp, ties: skTies }), _skPick);""",
"E5 local mirror"))

# reset the picker state each time Configure Day opens
EDITS.append((
"""      state.gameParticipants = {}; state.nassauInstances = []; state.matchInstances = [];""",
"""      state.gameParticipants = {}; state.nassauInstances = []; state.matchInstances = [];
      state._tpotPlayers = {};   // v1962: the prize-pool tile pickers start from what this event saved
      try { document.querySelectorAll('.participant-picker.tpot-picker').forEach(el => el.remove()); } catch (e) {}""",
"E6 reset"))


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
