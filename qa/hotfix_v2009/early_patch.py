import sys
path = sys.argv[1]
src = open(path, encoding='utf-8').read()

edits = []

# 1) Button in each group's fold for the director, while that group is live.
old1 = """        ((info.gameCode && info.started && !info.finished && t2CanManage(t)) ?
          '<button class="bg-btn bg-btn--danger bg-btn--full full t2-force-finish" data-code="' + t2esc(info.gameCode) + '" style="margin-top:6px">🔒 Force finish this group</button>' +"""
new1 = """        // v2009 (Tyler/Kevin 11/4, Bad Wednesday): racing the daylight. One tap for the director ends every
        // group of the day and scores the event pools on the holes EVERY group finished.
        ((info.gameCode && info.started && !info.finished && t2CanManage(t)) ?
          '<button class="bg-btn bg-btn--full full t2-end-early" data-id="' + t2esc(t.id) + '" data-day="' + (info.day || 1) + '" style="margin-top:6px">\\u23F1 End the event early (all groups)</button>' +
          '<div class="small-text" style="color:var(--text-muted);margin-top:2px">Running out of daylight? Ends every group now. Event pools count only the holes every group finished.</div>' : '') +
        ((info.gameCode && info.started && !info.finished && t2CanManage(t)) ?
          '<button class="bg-btn bg-btn--danger bg-btn--full full t2-force-finish" data-code="' + t2esc(info.gameCode) + '" style="margin-top:6px">🔒 Force finish this group</button>' +"""
edits.append(('button', old1, new1))

# 2) Wiring.
old2 = """  document.querySelectorAll('#t2-list .t2-force-finish').forEach(b => b.onclick = () => t2ForceFinishRound(b.dataset.code));"""
new2 = old2 + """
  document.querySelectorAll('#t2-list .t2-end-early').forEach(b => b.onclick = () => t2EndEventEarly(b.dataset.id, parseInt(b.dataset.day, 10) || 1));   // v2009"""
edits.append(('wire', old2, new2))

# 3) The action, right after t2ForceFinishRound.
old3 = """// v2002 (matrix TOURNEY-2): true when a launched round has no score posted by anyone.
function _t2RoundHasNoScores(g) {"""
new3 = r"""/* v2009 (Tyler/Kevin 11/4 "may not get done by sunrise" -- sunset): END THE EVENT EARLY.
   Tyler's rule: when the groups stop on different holes, the EVENT's games count only the holes
   EVERY group finished; each GROUP's own games settle on the last hole that group played (that part
   is the normal early-finish behaviour of a finished round). This writes the adjustment INTO each
   round's own game settings, which every phone on every build already reads, so the event settles
   the same on every phone -- not only on this one:
   - Field Quota pool: each player's quota = his full quota x (common holes / round holes), plus the
     points he made on holes outside the common set (so those holes add nothing). Ranking result =
     points on the common holes - prorated quota. The original setting is kept in quota._early.
   - Field CTP: a CTP hole not finished by every group is called off (removed from the round's holes;
     the original list is kept in ctp._early).
   Then every unfinished group is finished (same stamps as Force finish; blanks are only filled on
   holes that group actually played). Other event pots are listed as "not adjusted". */
function _bgEarlyRanges(holes) {
  try {
    const a = holes.slice().sort((x, y) => x - y), out = [];
    let s = null, p = null;
    a.forEach(h => { if (s === null) { s = p = h; } else if (h === p + 1) { p = h; } else { out.push(s === p ? String(s) : (s + '–' + p)); s = p = h; } });
    if (s !== null) out.push(s === p ? String(s) : (s + '–' + p));
    return out.join(', ');
  } catch (e) { return ''; }
}
async function t2EndEventEarly(tid, day) {
  try {
    if (!tid) return;
    let t = null; try { const _r = await t2GetX(tid); t = _r && _r.data; } catch (e) {}
    if (!t) { showToast('Could not load the event'); return; }
    if (!t2CanManage(t)) { showToast('Only the commissioner or a tourney admin can end the event early'); return; }
    const _dayN = Number(day) || 1;
    let rows = []; try { rows = (await loadTourneyRawRounds(t)) || []; } catch (e) { rows = []; }
    let rounds = rows.map(r => (r && r.data) ? r.data : r).filter(g => g && g.code && Array.isArray(g.players) && Number((g.t2 && g.t2.day) || 1) === _dayN);
    rounds = rounds.filter(g => { try { return !(typeof _t2IsNoShowRound === 'function' && _t2IsNoShowRound(g)); } catch (e) { return true; } });
    // the round open on this phone may hold scores newer than the server copy
    rounds = rounds.map(g => (state.game && state.game.code === g.code) ? state.game : g);
    if (!rounds.length) { showToast('No group has started yet'); return; }
    const _left = (g, pid) => { try { return (typeof bgLeftAfter === 'function') && bgLeftAfter(g, pid) != null; } catch (e) { return false; } };
    // Holes (0-based physical index) finished by every player still playing, in every group.
    const common = [];
    for (let h = 0; h < 18; h++) {
      let ok = true;
      rounds.forEach(g => {
        if (!ok) return;
        const act = g.players.filter(p => p && p.id && !_left(g, p.id));
        if (!act.length) return;   // everyone in this cart left: it does not hold anyone back
        if (!act.every(p => { const sc = (g.scores && g.scores[p.id]) || []; return sc[h] != null && sc[h] !== ''; })) ok = false;
      });
      if (ok) common.push(h);
    }
    if (!common.length) { showToast('No hole has been finished by every group yet'); return; }
    const holesNum = common.map(h => h + 1);
    const N = common.length, inS = {}; common.forEach(h => { inS[h] = 1; });
    // What it touches
    const ctpAll = {}; let ctpGreenie = false, anyQuota = false;
    rounds.forEach(g => {
      const c = g.games && g.games.ctp;
      if (c && c.fieldOnly) {
        if (c.greenie) ctpGreenie = true;
        const base = (c._early && Array.isArray(c._early.orig)) ? c._early.orig : (Array.isArray(c.holes) ? c.holes : []);
        base.forEach(h => { ctpAll[h] = 1; });
      }
      const q = g.games && g.games.quota;
      if (q && (q.mode || 'pool') !== 'perpoint') anyQuota = true;
    });
    const ctpOff = Object.keys(ctpAll).map(Number).filter(h => !inS[h - 1]).sort((a, b) => a - b);
    const notAdj = [];
    try {
      const s = t.settings || {}, dg = (s.dayGames && s.dayGames[_dayN]) || {};
      if (s.tourneySkins && s.tourneySkins.on) notAdj.push('event Skins');
      if (s.tourneyLongPutt && s.tourneyLongPutt.on) notAdj.push('Long Putt');
      const sp = s.tourneySidePots || {}; Object.keys(sp).forEach(k => { if (sp[k] && sp[k].on) notAdj.push(k === 'lowNet' ? 'Low Net' : (k === 'girs' ? 'GIR pool' : (k === 'putts' ? 'Putts pool' : k))); });
      Object.keys(dg).forEach(k => { if (k !== 'quota' && k !== 'ctp' && dg[k]) notAdj.push(k); });
      if (ctpGreenie) notAdj.push('Greenies');
    } catch (e) {}
    const unfinished = rounds.filter(g => !g.finishedAt);
    const msg = 'Every group is scored for the event on holes ' + _bgEarlyRanges(holesNum) + ' (' + N + ' hole' + (N === 1 ? '' : 's') + ', the holes every group finished).'
      + (anyQuota ? ' Quota is cut to ' + N + '/' + ((typeof roundHoles === 'function' ? roundHoles(rounds[0]) : 18) || 18) + ' of each player’s quota, rounded to the nearest point.' : '')
      + (ctpOff.length ? ' Closest to the Pin on hole ' + ctpOff.join(', ') + ' is called off.' : '')
      + ' Each group’s own games settle on the holes that group played.'
      + (unfinished.length ? ' ' + unfinished.length + ' group' + (unfinished.length === 1 ? ' is' : 's are') + ' finished now.' : '')
      + (notAdj.length ? ' Not adjusted: ' + notAdj.join(', ') + '.' : '');
    const ok = await uiConfirm(msg, { title: 'End the event early?', okLabel: 'End it', cancelLabel: 'Cancel', danger: true });
    if (!ok) return;
    const now = Date.now(), by = (_authUser && _authUser.id) || null;
    let bad = 0;
    for (const g of rounds) {
      try {
        const rh = ((typeof roundHoles === 'function') ? roundHoles(g) : 18) || 18;
        const q = g.games && g.games.quota;
        if (q && (q.mode || 'pool') !== 'perpoint') {
          if (!q._early) q._early = { orig: { basis: q.basis || null, quotas: q.quotas ? JSON.parse(JSON.stringify(q.quotas)) : null } };
          const base = Object.assign({}, q, { basis: q._early.orig.basis, quotas: q._early.orig.quotas });
          if (!base.basis) delete base.basis;
          if (!base.quotas) delete base.quotas;
          const qs = {};
          g.players.forEach(p => {
            if (!p || !p.id) return;
            let full = 0; try { full = Number(quotaTargetFor(g, base, p)) || 0; } catch (e) { full = 0; }
            let beyond = 0;
            const sc = (g.scores && g.scores[p.id]) || [];
            for (let h = 0; h < 18; h++) { if (inS[h]) continue; const v = sc[h]; if (v == null || v === '') continue; try { beyond += Number(quotaPointsForHole(Number(v), parFor(g, p.id, h))) || 0; } catch (e) {} }
            qs[p.id] = Math.round(full * N / rh) + beyond;   // whole points, like every quota (ties stay exact on every build)
          });
          q.basis = 'manual'; q.quotas = qs; q._early.holes = holesNum; q._early.at = now;
        }
        const c = g.games && g.games.ctp;
        if (c && c.fieldOnly && !c.greenie && Array.isArray(c.holes)) {
          if (!c._early) c._early = { orig: c.holes.slice() };
          c.holes = c._early.orig.filter(h => inS[Number(h) - 1]);
          c._early.holes = holesNum; c._early.at = now;
        }
        g.t2 = g.t2 || {};
        g.t2.earlyEnd = { holes: holesNum, at: now, by: by };
        if (!g.finishedAt) {
          g.finishedAt = now;
          g.forceFinishedBy = by;
          g.t2.forceFinishedBy = by; g.t2.forceFinishedAt = now;
          try { const _pu = bgAutoPickupBlanks(g, by); if (_pu.length) g.t2.pickupLog = { at: now, by: by, n: _pu.length }; } catch (e) {}
        }
        g.updatedAt = now;
        let saved = false;
        try { saved = await bgT2SaveRoundPatch(g, { games: g.games, finishedAt: g.finishedAt, t2: g.t2 }); } catch (e) { saved = false; }
        if (saved === false) bad++;
        try { if (state.game && state.game.code === g.code) state.viewOnlyMode = true; } catch (e) {}
        try { if (typeof liveActivity !== 'undefined') liveActivity.endIfCode(g.code); } catch (e) {}
      } catch (e) { bad++; try { console.warn('t2EndEventEarly round', g && g.code, e); } catch (e2) {} }
    }
    try { for (const g of rounds) { if (typeof t2MaybeCompleteDay === 'function') await t2MaybeCompleteDay(g); } } catch (e) {}
    try { if (typeof _t2InvalidateFieldRounds === 'function') _t2InvalidateFieldRounds(tid); } catch (e) {}
    try { if (typeof _bgEventMoneyCache !== 'undefined') delete _bgEventMoneyCache[tid]; } catch (e) {}
    try { if (window._bgT2Published) delete window._bgT2Published[tid]; } catch (e) {}
    try { if (typeof _t2BoardMoneyCache !== 'undefined') _t2BoardMoneyCache.tid = null; } catch (e) {}
    showToast(bad ? ('Ended, but ' + bad + ' group' + (bad === 1 ? '' : 's') + ' did not save — check your connection and tap again') : ('Event ended early — scored on holes ' + _bgEarlyRanges(holesNum)));
    try { renderT2List(); } catch (e) {}
  } catch (e) { console.warn('t2EndEventEarly', e); showToast('Could not end the event early'); }
}
// v2002 (matrix TOURNEY-2): true when a launched round has no score posted by anyone.
function _t2RoundHasNoScores(g) {"""
edits.append(('action', old3, new3))

for name, old, new in edits:
    n = src.count(old)
    assert n == 1, (name, n)
    src = src.replace(old, new)
    print('applied', name)
open(path, 'w', encoding='utf-8').write(src)
