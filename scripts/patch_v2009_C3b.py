#!/usr/bin/env python3
"""v2009 C3b patcher (Tyler, 11/3): league standings table, week boards, bracket card, finalize prompt,
public standings page, "Where everyone stands".

Applies every (old, new) pair to BOTH golf-app.html and www/index.html, asserting each `old` occurs
exactly once per file (and refusing a second run: marker check).

    python3 scripts/patch_v2009_C3b.py

Covers (qa/league_v2009/FIXED_C3b.md has the row-by-row list):
  SCORING-5  field "Scorecards by week" board ranks on the server's week result / the season's measure
  SCORING-6  public page shows to-par totals and OUT for a to-par race (league_public_standings v2009 fields)
  OPEN-S5    bracket fixtures read "won on net" / "won as the higher seed" / bye; champion from the server
  OPEN-S4/D4 champion named from playoff placings; season prize pool pending until the final
  D15        best N of M counting on the table; dropped weeks greyed + tagged in the week-by-week view
  D12        a disputed final week reads "reopen requested"
  LIFE-13    finalize "who is missing" built per entrant / seat from the matchups (teams, subs)
  POOLS-9    "Where everyone stands" = Unit Totals (settle members[].whole, S3 R3; league holding is a party)
  POOLS-3    week screen: tied CTP / Long Putt / Long Drive shown from co_member_ids + commissioner tie picker (S3 R5)
  P2         week screen "In so far" sorted by the season's measure (Stableford high-good)
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
MARK = 'v2009 C3b (Tyler, 11/3)'

P = []   # (label, old, new)

# ---------------------------------------------------------------- CSS
P.append(('css', r""".lg-scf-tag--warn { color: #b7791f; border-color: rgba(183,121,31,.45); }""",
r""".lg-scf-tag--warn { color: #b7791f; border-color: rgba(183,121,31,.45); }
  /* v2009 C3b (Tyler, 11/3): D15 a week that is not one of the best N counting reads greyed AND says so in words
     (Color-blind setting: never colour alone). D12 a final week a player has asked to reopen. */
  .lg-scf-row--dropped { opacity: .55; }
  .lg-scf-tag--drop { font-style: italic; }
  .lg-reopen-pill { display: inline-block; font-size: 11px; font-weight: 800; padding: 1px 8px; border-radius: 999px; border: 1px dashed #b7791f; color: #b7791f; white-space: nowrap; }
  :root[data-theme="dark"] .lg-reopen-pill, :root[data-theme="dark"] .lg-scf-tag--warn { color: #ffb15c; border-color: #ffb15c; }"""))

# ---------------------------------------------------------------- shared helpers (before lgOpenStandings)
P.append(('helpers', r"""async function lgOpenStandings(sid, seg) {
  const body = document.getElementById('league-body'); if (!body || !sid) return;""",
r"""/* ===================== v2009 C3b (Tyler, 11/3): league display helpers =====================
   One place for the rules every standings-type screen shares, so the table, the week board, the
   bracket card, the public page and the money screen cannot drift apart again. */

/* Stableford points of one card -- a byte-for-byte mirror of public.league_stableford_points
   (default table 5/4/3/2/1/0). Only used where the server has not ranked the week yet. */
function lgSfPoints(net, pars, table) {
  try {
    if (!Array.isArray(net) || !Array.isArray(pars)) return null;
    const t = table || {};
    const v = function (k, d) { const n = parseInt(t[k], 10); return isFinite(n) ? n : d; };
    let tot = 0;
    for (let i = 0; i < net.length; i++) {
      const n = Number(net[i]), p = Number(pars[i]);
      if (net[i] == null || pars[i] == null || !isFinite(n) || !isFinite(p)) continue;
      const d = n - p;
      tot += d <= -2 ? v('eagle', 5) : d === -1 ? v('birdie', 4) : d === 0 ? v('par', 3)
           : d === 1 ? v('bogey', 2) : d === 2 ? v('double', 1) : v('worse', 0);
    }
    return tot;
  } catch (e) { return null; }
}
window.lgSfPoints = lgSfPoints;

/* SCORING-5: order a field week the way the SERVER ranked it. `lines` are {m, c, tp, sf, ok, nm}.
   A final week: league_finalize_week's result_json.position (ties pooled only where the server pooled
   them, i.e. same position), falling back to a_points (monotonic in position). An open week has no
   server result yet: provisional, on the season's own measure -- Stableford points HIGH first, else net
   to par LOW first. Sets L.rank / L.tied and returns the lines sorted. */
function lgFieldWeekRank(lines, final, stableford) {
  try {
    const big = function (v) { return v == null ? 1e9 : v; };
    const pos = function (L) {
      const rj = (L.m && L.m.result_json) || {};
      const p = parseInt(rj.position, 10);
      return isFinite(p) && p > 0 ? p : null;
    };
    const pts = function (L) { const a = L.m ? L.m.a_points : null; return (a == null || a === '' || !isFinite(Number(a))) ? null : Number(a); };
    const measure = function (L) { return stableford ? (L.sf == null ? 1e9 : -Number(L.sf)) : big(L.tp); };
    const served = final && lines.some(function (L) { return L.c && (pos(L) != null || pts(L) != null) && L.m.status !== 'forfeit'; });
    lines.sort(function (x, y) {
      const xc = x.c ? 0 : 1, yc = y.c ? 0 : 1;
      if (xc !== yc) return xc - yc;
      if (served) {
        const xp = pos(x), yp = pos(y);
        if (xp != null || yp != null) { if (xp == null) return 1; if (yp == null) return -1; if (xp !== yp) return xp - yp; }
        const xa = pts(x), ya = pts(y);
        if (xa !== ya) return (ya == null ? -1e9 : ya) - (xa == null ? -1e9 : xa);
        return x.nm.localeCompare(y.nm);
      }
      return ((x.ok ? 0 : 1) - (y.ok ? 0 : 1)) || (measure(x) - measure(y)) || x.nm.localeCompare(y.nm);
    });
    let seen = 0, rk = 0, prevKey = null;
    lines.forEach(function (L) {
      L.rank = 0;
      if (!L.c || !L.ok || (served && L.m.status === 'forfeit')) return;
      seen++;
      const key = served ? (pos(L) != null ? 'p' + pos(L) : 'a' + pts(L)) : String(measure(L));
      if (key !== prevKey) { rk = seen; prevKey = key; }
      L.rank = rk;
    });
    const n = {}; lines.forEach(function (L) { if (L.rank) n[L.rank] = (n[L.rank] || 0) + 1; });
    lines.forEach(function (L) { L.tied = !!(L.rank && n[L.rank] > 1); });
    return { lines: lines, served: served };
  } catch (e) { return { lines: lines, served: false }; }
}
window.lgFieldWeekRank = lgFieldWeekRank;

/* OPEN-S5: what a bracket fixture says. The server records who went through and why
   (result_json.bracket_winner / bracket_decided_by: points | net | seed | bye, S1 v2009). A match level on
   points used to read "tied" / "Halved" while the bracket had already sent somebody on. */
function lgBracketResult(m, nameOf) {
  try {
    const rj = (m && m.result_json) || {};
    const nm = function (id) { return (nameOf && nameOf(id)) || 'TBD'; };
    if (m && m.kind === 'bye') return { winner: m.a_entrant_id, text: nm(m.a_entrant_id) + ' has a bye — straight through', by: 'bye' };
    if (!m || m.status !== 'final') return null;
    let w = rj.bracket_winner || null, by = rj.bracket_decided_by || null;
    const ap = Number(m.a_points) || 0, bp = Number(m.b_points) || 0;
    if (!w && ap !== bp) { w = ap > bp ? m.a_entrant_id : m.b_entrant_id; by = 'points'; }
    if (!w) return { winner: null, text: 'Halved · ' + ap + '–' + bp, by: null };
    const how = by === 'net' ? ' won on net' : (by === 'seed' ? ' won as the higher seed' : (by === 'bye' ? ' — bye' : ' won'));
    return { winner: w, text: nm(w) + how + (by === 'bye' ? '' : ' · ' + ap + '–' + bp), by: by };
  } catch (e) { return null; }
}
window.lgBracketResult = lgBracketResult;

/* D12: a final week a player has disputed is a REOPEN REQUEST to the commissioner -- the results stand
   until he reopens it. Read from the cards (disputed_by on a card in a final week) or from a week-level
   flag (format_config.reopen_requested) so either server shape shows the same thing. */
function lgReopenRequested(w, cards) {
  try {
    if (!w || w.status !== 'final') return null;
    const fc = w.format_config || {};
    const ds = (cards || []).filter(function (c) { return c && c.disputed_by; });
    if (!ds.length && !fc.reopen_requested) return null;
    return { cards: ds, note: (ds[0] && ds[0].dispute_note) || (fc.reopen_requested && fc.reopen_requested.note) || '' };
  } catch (e) { return null; }
}
window.lgReopenRequested = lgReopenRequested;

/* LIFE-13: who has no card, built per ENTRANT / SEAT from the week's fixtures, the way
   league_finalize_week sees it. A team entrant is a team id (never a member id), and a seat a sub holds
   is filled by the SUB's card (member_id = the sub). Returns [{name, memberId}] -- memberId is who the
   commissioner would enter a card for (the sub, for a sub-held seat). */
function lgWeekMissingSeats(mus, cards, members, absences, teamNameOf, teamRule) {
  const out = [];
  try {
    const byId = {}; (members || []).forEach(function (m) { byId[m.id] = m; });
    const nm = function (id) { return (byId[id] && byId[id].display_name) || 'A player'; };
    const absOf = {}; (absences || []).forEach(function (a) { if (a && a.member_id) absOf[(a.matchup_id || '') + '|' + a.member_id] = a; });
    const seen = {};
    const has = function (mu, pred) { return (cards || []).some(function (c) { return c.matchup_id === mu.id && pred(c); }); };
    let ent0 = null;
    const seat = function (mu, mid, team) {
      const a = absOf[mu.id + '|' + mid];
      if (a && ['forfeit', 'blind_draw', 'course'].indexOf(a.resolution) >= 0) return;   /* the commissioner already settled the seat */
      const holder = a ? (a.current_member_id || a.sub_member_id || null) : null;
      const covered = has(mu, function (c) { return c.member_id === mid || (holder && c.member_id === holder); });
      if (covered) return;
      const k = mu.id + '|' + mid; if (seen[k]) return; seen[k] = 1;
      const base = holder ? (nm(holder) + ' (sub for ' + nm(mid) + ')') : nm(mid);
      /* a team partner whose side still has a card: the team plays on (D5) instead of taking no score */
      const partner = !!(team && has(mu, function (c) { return c.entrant_id === ent0; }));
      out.push({ name: team ? base + ' · ' + team : base, memberId: holder || mid, partner: partner });
    };
    (mus || []).forEach(function (mu) {
      if (!mu || mu.kind === 'bye' || mu.status === 'void') return;
      [mu.a_entrant_id, mu.b_entrant_id].forEach(function (ent) {
        if (!ent) return;
        const team = teamNameOf && teamNameOf[ent];
        if (mu.entrant_kind === 'team' || team) {
          const roster = (members || []).filter(function (m) { return m.team_id === ent && m.status === 'active' && m.role !== 'sub'; });
          if (String(teamRule || '') === 'scramble') {
            if (has(mu, function (c) { return c.entrant_id === ent; })) return;
            const k = mu.id + '|' + ent; if (seen[k]) return; seen[k] = 1;
            out.push({ name: team || 'A team', memberId: roster[0] ? roster[0].id : null });
            return;
          }
          ent0 = ent;
          roster.forEach(function (m) { seat(mu, m.id, team || 'team'); });
          return;
        }
        const m = byId[ent];
        if (!m || m.status !== 'active') return;   /* a removed member's slot is voided by finalize (v2002 OPEN-L6) */
        seat(mu, ent, null);
      });
    });
  } catch (e) {}
  return out;
}
window.lgWeekMissingSeats = lgWeekMissingSeats;

/* POOLS-9: "Where everyone stands" must equal Unit Totals. While the league holds money (the fee
   mid-season, an unwon pot) the members' balances do not sum to zero on their own, so per-player
   rounding printed 12.5 x 3 as -12 / -12 / -12 against "The league still holds 38". This is
   league_money_settle's rounding, step for step: each member's cents rounded half away from zero, the
   league's holding the same, and the residue walked one unit at a time (too much handed out -> the member
   the rounding favoured most gives one back; too little -> the member it cost most takes one; ties: the
   larger |balance|, then the lower member id). Returns { byId, league }. */
function lgLeagueWhole(members, pots) {
  const out = { byId: {}, league: 0 };
  try {
    const half = function (c) { return (c < 0 ? -1 : (c > 0 ? 1 : 0)) * Math.floor(Math.abs(c) / 100 + 0.5); };
    const rows = (members || []).filter(function (m) { return m && m.member_id != null; }).map(function (m) {
      const c = Math.round((Number(m.net) || 0) * 100); return { id: String(m.member_id), c: c, u: half(c) };
    }).sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
    rows.forEach(function (r) { r.g = r.u * 100 - r.c; });
    let hold = 0; (pots || []).forEach(function (p) { hold += Math.round((Number(p && p.holding) || 0) * 100); });
    let resid = half(hold) + rows.reduce(function (a, r) { return a + r.u; }, 0);
    let guard = rows.length * 4 + 20;
    const tie = function (x, p) { return Math.abs(x.c) > Math.abs(p.c) || (Math.abs(x.c) === Math.abs(p.c) && x.id < p.id); };
    while (resid !== 0 && guard-- > 0 && rows.length) {
      let pick = rows[0];
      for (let i = 1; i < rows.length; i++) {
        const x = rows[i];
        if (resid > 0 ? (x.g > pick.g || (x.g === pick.g && tie(x, pick))) : (x.g < pick.g || (x.g === pick.g && tie(x, pick)))) pick = x;
      }
      if (resid > 0) { pick.u -= 1; pick.g -= 100; resid -= 1; } else { pick.u += 1; pick.g += 100; resid += 1; }
    }
    rows.forEach(function (r) { out.byId[r.id] = r.u; });
    out.league = -rows.reduce(function (a, r) { return a + r.u; }, 0);
  } catch (e) {}
  return out;
}
window.lgLeagueWhole = lgLeagueWhole;

async function lgOpenStandings(sid, seg) {
  const body = document.getElementById('league-body'); if (!body || !sid) return;"""))

# ---------------------------------------------------------------- standings: weeks + bracket reads
P.append(('st-weeks-select', r"""    const wr = await supa.from('league_weeks').select('id,week_number,status,is_playoff,format_config,date,nine,course_snapshot').eq('season_id', sid).order('week_number', { ascending: true });   /* v1650: + date/nine/snapshot for the scorecards */""",
r"""    const wr = await supa.from('league_weeks').select('id,week_number,status,is_playoff,format_config,date,nine,course_snapshot,settings_snapshot').eq('season_id', sid).order('week_number', { ascending: true });   /* v1650: + date/nine/snapshot for the scorecards; v2009 C3b (Tyler, 11/3): + settings_snapshot, the week's own points system (SCORING-5) */"""))
P.append(('st-po-select', r"""      const mr = await supa.from('league_matchups').select('id,week_id,a_entrant_id,b_entrant_id,kind,status,a_points,b_points').in('week_id', _pids);
      if (mr && !mr.error && Array.isArray(mr.data)) mr.data.forEach(function (m) { if (m.kind !== 'bye') (_poMuSt[m.week_id] = _poMuSt[m.week_id] || []).push(m); });""",
r"""      /* v2009 C3b (Tyler, 11/3): OPEN-S5: + result_json (who the bracket sent through, and why) and the byes. */
      const mr = await supa.from('league_matchups').select('id,week_id,a_entrant_id,b_entrant_id,kind,status,a_points,b_points,result_json').in('week_id', _pids);
      if (mr && !mr.error && Array.isArray(mr.data)) mr.data.forEach(function (m) { if (m.kind !== 'bye') (_poMuSt[m.week_id] = _poMuSt[m.week_id] || []).push(m); else (_poByeSt[m.week_id] = _poByeSt[m.week_id] || []).push(m); });"""))
P.append(('st-po-decl', r"""  let _wksSt = [], _poMuSt = {}, _payersSt = 0;""",
r"""  let _wksSt = [], _poMuSt = {}, _payersSt = 0;
  let _poByeSt = {}, _poPlacings = [];   /* v2009 C3b (Tyler, 11/3): OPEN-S5 byes; OPEN-S4 / D4 bracket placings (segment 'playoff') */"""))
P.append(('st-po-placings', r"""  const sset = Object.assign({}, (sr.ok && sr.data && sr.data.settings) || {},
    { public_standings: !!(sr.ok && sr.data && sr.data.public_standings) });""",
r"""  const sset = Object.assign({}, (sr.ok && sr.data && sr.data.settings) || {},
    { public_standings: !!(sr.ok && sr.data && sr.data.public_standings) });
  /* v2009 C3b (Tyler, 11/3): OPEN-S4 / D4: the bracket's own placings -- rank 1 is the champion the SERVER
     named (a final level on points included). They exist only once the final is final. */
  try {
    if (sset.playoffs && sset.playoffs.enabled && window._lgSeg === 'full') {
      const pr = await supa.rpc('league_standings_get', { p_season_id: sid, p_segment: 'playoff' });
      if (pr && !pr.error && Array.isArray(pr.data)) _poPlacings = pr.data.slice();
    }
  } catch (e) { _poPlacings = []; }"""))

# ---------------------------------------------------------------- standings table: D15 best N
P.append(('st-table-head', r"""    h += '<div class="card"><div class="bg-sec">Table <span class="bg-sec-count">' + rows.length + '</span></div>' +""",
r"""    /* v2009 C3b (Tyler, 11/3): D15: "best N of M counting", straight off the server's row. */
    let _bestTxt = '';
    try {
      const _bn = rows.filter(function (r) { return r.best_n; })[0];
      if (_bn) _bestTxt = '<p class="help-text" style="margin:6px 0 0;font-size:12px">Best ' + Number(_bn.best_n) +
        (_bn.of_weeks ? ' of ' + Number(_bn.of_weeks) : '') + ' weeks counting' +
        (_bn.weeks_counted ? ' — ' + Number(_bn.weeks_counted) + ' counted so far' : '') +
        '. A week that is not one of a player’s best is shown as not counted.</p>';
    } catch (e) { _bestTxt = ''; }
    h += '<div class="card"><div class="bg-sec">Table <span class="bg-sec-count">' + rows.length + '</span></div>' + _bestTxt +"""))
P.append(('st-table-drop', r"""          '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(rec.join(' · ') + tb) + '</div>' +""",
r"""          '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(rec.join(' · ') + tb) + '</div>' +
          /* v2009 C3b (Tyler, 11/3): D15: which weeks this player is NOT counting */
          ((Array.isArray(r.dropped_weeks) && r.dropped_weeks.length)
            ? '<div class="help-text" style="margin:0;font-size:11.5px;font-style:italic">Not counted: week' + (r.dropped_weeks.length === 1 ? ' ' : 's ') + lgEsc(r.dropped_weeks.join(', ')) + '</div>' : '') +"""))

# ---------------------------------------------------------------- bracket card: wording + champion
P.append(('st-fixline', r"""        const _fixLine = function (m) {
          const a = _nmOf[m.a_entrant_id] || 'TBD', b = _nmOf[m.b_entrant_id] || 'TBD';
          const done = m.status === 'final';
          const ap = Number(m.a_points) || 0, bp = Number(m.b_points) || 0;
          const win = done ? (ap > bp ? a : (bp > ap ? b : '')) : '';
          return '<div style="display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--bg-border,var(--bg-border))">' +
            '<div style="flex:1;min-width:0;font-size:14px;font-weight:600">' + lgEsc(a) + ' <span class="help-text" style="font-size:12px">v</span> ' + lgEsc(b) + '</div>' +
            '<div class="small-text" style="flex:0 0 auto;color:' + (done ? 'var(--money-pos)' : 'var(--text-muted)') + ';font-weight:600">' + (done ? (win ? lgEsc(win) + ' won' : 'tied') : lgEsc(m.status || 'scheduled')) + '</div></div>';
        };""",
r"""        const _fixLine = function (m) {
          const a = _nmOf[m.a_entrant_id] || 'TBD', b = _nmOf[m.b_entrant_id] || 'TBD';
          const done = m.status === 'final';
          /* v2009 C3b (Tyler, 11/3): OPEN-S5: "won on net" / "won as the higher seed", from the server's bracket record */
          const br = done ? lgBracketResult(m, function (id) { return _nmOf[id]; }) : null;
          return '<div style="display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--bg-border,var(--bg-border))">' +
            '<div style="flex:1;min-width:0;font-size:14px;font-weight:600">' + lgEsc(a) + ' <span class="help-text" style="font-size:12px">v</span> ' + lgEsc(b) + '</div>' +
            '<div class="small-text" style="flex:0 0 auto;color:' + (done ? 'var(--money-pos)' : 'var(--text-muted)') + ';font-weight:600">' + (done ? lgEsc(br ? br.text : 'final') : lgEsc(m.status || 'scheduled')) + '</div></div>';
        };"""))
P.append(('st-champ', r"""          let champ = '';
          if (_fm && _fm.status === 'final') {
            const ap = Number(_fm.a_points) || 0, bp = Number(_fm.b_points) || 0;
            champ = ap > bp ? _nmOf[_fm.a_entrant_id] : (bp > ap ? _nmOf[_fm.b_entrant_id] : '');
          }""",
r"""          let champ = '';
          /* v2009 C3b (Tyler, 11/3): OPEN-S4: the champion is the server's playoff rank 1 (a final level on
             points has one too); then the final's bracket record; points only as the last resort. */
          try {
            const _p1 = (_poPlacings || []).filter(function (r) { return Number(r.rank) === 1; })[0];
            if (_p1) champ = _p1.name || _nmOf[_p1.entrant_id] || '';
          } catch (e) {}
          if (!champ && _fm && _fm.status === 'final') {
            const _br = lgBracketResult(_fm, function (id) { return _nmOf[id]; });
            champ = (_br && _br.winner) ? (_nmOf[_br.winner] || '') : '';
          }"""))
P.append(('st-byes', r"""          body += '<div style="margin-top:8px"><div style="display:flex;gap:8px;align-items:baseline">' +
            '<div style="flex:1;font-weight:700">Week ' + w.week_number + ' \u00b7 ' + lgEsc(_wkLbl(w)) + '</div>' +
            '<span class="bg-pill ' + (w.status === 'final' ? 'bg-pill-final' : (['open','in_play','awaiting_cards'].indexOf(w.status) >= 0 ? 'bg-pill-live' : 'bg-pill-sched')) + '">' + lgEsc(w.status || '') + '</span></div>' +
            mus.map(_fixLine).join('') +""",
r"""          body += '<div style="margin-top:8px"><div style="display:flex;gap:8px;align-items:baseline">' +
            '<div style="flex:1;font-weight:700">Week ' + w.week_number + ' · ' + lgEsc(_wkLbl(w)) + '</div>' +
            '<span class="bg-pill ' + (w.status === 'final' ? 'bg-pill-final' : (['open','in_play','awaiting_cards'].indexOf(w.status) >= 0 ? 'bg-pill-live' : 'bg-pill-sched')) + '">' + lgEsc(w.status || '') + '</span></div>' +
            mus.map(_fixLine).join('') +
            /* v2009 C3b (Tyler, 11/3): OPEN-S5: a bye is part of the bracket too */
            (_poByeSt[w.id] || []).map(function (m) {
              const br = lgBracketResult(m, function (id) { return _nmOf[id]; });
              return '<div class="help-text" style="padding:6px 0;border-top:1px solid var(--bg-border,var(--bg-border));font-size:13px">' + lgEsc(br ? br.text : 'Bye') + '</div>';
            }).join('') +"""))

# ---------------------------------------------------------------- h2h scorecards by week (playoff + D15 + D12)
P.append(('st-mr2', r"""      const mr2 = await supa.from('league_matchups').select('id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,status,a_points,b_points').in('week_id', _wkIds);""",
r"""      const mr2 = await supa.from('league_matchups').select('id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,status,a_points,b_points,result_json').in('week_id', _wkIds);   /* v2009 C3b (Tyler, 11/3): + result_json: the server's week result (SCORING-5) and bracket record (OPEN-S5) */"""))
P.append(('st-cards2', r"""        const cr2 = await supa.from('league_cards').select('id,matchup_id,member_id,entrant_id,gross,net,approved_at,course_name,course_pars,net_to_par,posted_at,disputed_by,handicap_used').in('matchup_id', _cardMu.slice(_ci, _ci + 100));""",
r"""        const cr2 = await supa.from('league_cards').select('id,matchup_id,member_id,entrant_id,gross,net,approved_at,course_name,course_pars,net_to_par,posted_at,disputed_by,dispute_note,handicap_used').in('matchup_id', _cardMu.slice(_ci, _ci + 100));   /* v2009 C3b: + dispute_note (D12) */"""))
P.append(('st-dropmap', r"""    const _entNm = function (ent) { return _teamNm[ent] || _nameOfSt[ent] || 'Player'; };""",
r"""    const _entNm = function (ent) { return _teamNm[ent] || _nameOfSt[ent] || 'Player'; };
    /* v2009 C3b (Tyler, 11/3): D15: entrant -> the weeks the server is NOT counting for them (best N of M) */
    const _dropOf = {};
    try { rows.forEach(function (r) { if (r.entrant_id && Array.isArray(r.dropped_weeks)) _dropOf[r.entrant_id] = r.dropped_weeks.map(Number); }); } catch (e) {}
    const _dropped = function (ent, w) { return !!(w && !w.is_playoff && _dropOf[ent] && _dropOf[ent].indexOf(Number(w.week_number)) >= 0); };
    /* v2009 C3b (Tyler, 11/3): D12: a final week somebody has asked to reopen */
    const _reopenOf = function (w, mus) {
      const ids = (mus || []).map(function (m) { return m.id; });
      return lgReopenRequested(w, _cardsAll.filter(function (c) { return ids.indexOf(c.matchup_id) >= 0; }));
    };
    const _reopenPill = '<span class="lg-reopen-pill">reopen requested</span>';"""))
P.append(('st-h2h-row', r"""      const rows = mus.map(function (m) {
        const a = _entNm(m.a_entrant_id), b = _entNm(m.b_entrant_id);
        const an = _net(m, m.a_entrant_id), bn = _net(m, m.b_entrant_id);
        const fin = m.status === 'final';
        const ap = Number(m.a_points) || 0, bp = Number(m.b_points) || 0;
        const aw = fin && ap > bp, bw = fin && bp > ap;
        const side = function (nm, net, won) {
          return '<span style="' + (won ? 'font-weight:800' : '') + '">' + (won ? '🏆 ' : '') + lgEsc(nm) + ' <span style="font-weight:700">' + (net == null ? '—' : net) + '</span></span>';
        };
        return '<div class="lg-sc-row" data-ents="' + lgEsc(m.a_entrant_id) + ',' + lgEsc(m.b_entrant_id) + '" style="display:flex;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--bg-border,var(--bg-border));font-size:13px">' +
          '<div style="flex:1;min-width:0;line-height:1.4">' + side(a, an, aw) + ' <span class="help-text" style="font-size:12px">v</span> ' + side(b, bn, bw) +
            (fin ? '<div class="help-text" style="margin:0;font-size:11px">' + (aw ? lgEsc(a) + ' won' : (bw ? lgEsc(b) + ' won' : 'Halved')) + ' · ' + ap + '–' + bp + '</div>' : '') + '</div>' +""",
r"""      const rows = mus.map(function (m) {
        const a = _entNm(m.a_entrant_id), b = _entNm(m.b_entrant_id);
        const an = _net(m, m.a_entrant_id), bn = _net(m, m.b_entrant_id);
        const fin = m.status === 'final';
        const ap = Number(m.a_points) || 0, bp = Number(m.b_points) || 0;
        let aw = fin && ap > bp, bw = fin && bp > ap;
        /* v2009 C3b (Tyler, 11/3): OPEN-S5: a bracket fixture level on points still sent somebody through */
        let _res = fin ? ((aw ? lgEsc(a) + ' won' : (bw ? lgEsc(b) + ' won' : 'Halved')) + ' · ' + ap + '–' + bp) : '';
        try {
          if (fin && w.is_playoff) {
            const br = lgBracketResult(m, _entNm);
            if (br && br.winner) { aw = br.winner === m.a_entrant_id; bw = br.winner === m.b_entrant_id; _res = lgEsc(br.text); }
          }
        } catch (e) {}
        const side = function (nm, net, won, ent) {
          /* v2009 C3b (Tyler, 11/3): D15: a week this side is not counting says so in words, not only in grey */
          const _dr = _dropped(ent, w);
          return '<span style="' + (won ? 'font-weight:800' : '') + (_dr ? ';opacity:.6' : '') + '">' + (won ? '🏆 ' : '') + lgEsc(nm) + ' <span style="font-weight:700">' + (net == null ? '—' : net) + '</span>' +
            (_dr ? ' <span class="lg-scf-tag lg-scf-tag--drop">not counted</span>' : '') + '</span>';
        };
        return '<div class="lg-sc-row" data-ents="' + lgEsc(m.a_entrant_id) + ',' + lgEsc(m.b_entrant_id) + '" style="display:flex;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--bg-border,var(--bg-border));font-size:13px">' +
          '<div style="flex:1;min-width:0;line-height:1.4">' + side(a, an, aw, m.a_entrant_id) + ' <span class="help-text" style="font-size:12px">v</span> ' + side(b, bn, bw, m.b_entrant_id) +
            (fin ? '<div class="help-text" style="margin:0;font-size:11px">' + _res + '</div>' : '') + '</div>' +"""))
P.append(('st-h2h-head', r"""        '<div style="display:flex;gap:8px;align-items:baseline"><div style="flex:1;font-weight:700">' + lgEsc(lbl) + '</div>' +
        '<span class="help-text" style="margin:0;font-size:12px">' + lgEsc(lgWeekWhen(w)) + (w.nine ? ' · ' + lgEsc(lgNineLabel(w.nine)) : '') + '</span></div>' + rows + '</div>';""",
r"""        '<div style="display:flex;gap:8px;align-items:baseline"><div style="flex:1;font-weight:700">' + lgEsc(lbl) + '</div>' +
        (_reopenOf(w, mus) ? _reopenPill + ' ' : '') +   /* v2009 C3b (Tyler, 11/3): D12 */
        '<span class="help-text" style="margin:0;font-size:12px">' + lgEsc(lgWeekWhen(w)) + (w.nine ? ' · ' + lgEsc(lgNineLabel(w.nine)) : '') + '</span></div>' + rows + '</div>';"""))

# ---------------------------------------------------------------- field week board (SCORING-5)
P.append(('scf-lines', r"""        const lines = mus.map(function (m) {
          _entsF[m.a_entrant_id] = 1;
          const cs = _cardsAll.filter(function (c) { return c.matchup_id === m.id; }).sort(function (x, y) {
            return ((y.approved_at ? 1 : 0) - (x.approved_at ? 1 : 0)) || (_big(_tpOf(x, snap)) - _big(_tpOf(y, snap)));
          });
          const c = cs[0] || null;
          return { m: m, c: c, tp: c ? _tpOf(c, snap) : null, ok: !!(c && c.approved_at), nm: _entNm(m.a_entrant_id) };
        });
        lines.sort(function (x, y) {
          return ((x.c ? 0 : 1) - (y.c ? 0 : 1)) || ((x.ok ? 0 : 1) - (y.ok ? 0 : 1)) || (_big(x.tp) - _big(y.tp)) || x.nm.localeCompare(y.nm);
        });
        let _rk = 0, _seen = 0, _prev = null;
        lines.forEach(function (L) { if (L.c && L.ok) { _seen++; if (L.tp !== _prev) { _rk = _seen; _prev = L.tp; } L.rank = _rk; } });
        const _tied = {}; lines.forEach(function (L) { if (L.rank) _tied[L.rank] = (_tied[L.rank] || 0) + 1; });""",
r"""        /* v2009 C3b (Tyler, 11/3): SCORING-5: the week is ranked on the season's own measure. A Stableford
           week is Stableford POINTS, high first (it used to read net to par, low first -- the opposite of the
           table above it); a final week is in the SERVER's order (result_json.position, card-off included),
           so a tie the server split no longer prints T1 three times. */
        const _wset = w.settings_snapshot || {};
        const _sysW = String(((_wset.points || {}).system) || ((sset.points || {}).system) || '');
        const _sfW = _sysW === 'stableford';
        const _sfTbl = (_wset.points || {}).stableford_table || (sset.points || {}).stableford_table || null;
        const _sfOf = function (c, m) {
          try {
            const rj = (m && m.result_json) || {};
            if (rj.stableford != null && rj.stableford !== '') return Number(rj.stableford);
            const pars = (Array.isArray(c.course_pars) && c.course_pars.length) ? c.course_pars : snap.pars;
            return lgSfPoints(c.net, pars, _sfTbl);
          } catch (e) { return null; }
        };
        const lines = mus.map(function (m) {
          _entsF[m.a_entrant_id] = 1;
          const cs = _cardsAll.filter(function (c) { return c.matchup_id === m.id; }).sort(function (x, y) {
            return ((y.approved_at ? 1 : 0) - (x.approved_at ? 1 : 0)) || (_big(_tpOf(x, snap)) - _big(_tpOf(y, snap)));
          });
          const c = cs[0] || null;
          return { m: m, c: c, tp: c ? _tpOf(c, snap) : null, sf: (c && _sfW) ? _sfOf(c, m) : null, ok: !!(c && c.approved_at), nm: _entNm(m.a_entrant_id) };
        });
        const _rkd = lgFieldWeekRank(lines, w.status === 'final', _sfW);
        const _tied = {}; lines.forEach(function (L) { if (L.rank && L.tied) _tied[L.rank] = 2; });"""))
P.append(('scf-lead', r"""        const leadTxt = lead.length ? ('Low: ' + lead.map(function (L) { return L.nm.split(' ')[0]; }).join(', ') + ' ' + fmtPar(lead[0].tp)) : (nCards ? 'waiting on sign-off' : 'no cards yet');""",
r"""        /* v2009 C3b (Tyler, 11/3): SCORING-5: the header names only the server's position-1 entrant(s), and says
           which way the week ran: Low (net to par) or High (Stableford points); Leading while the week is open. */
        const _ptsTxt = function (L) { return L.sf == null ? '' : (L.sf + ' pts'); };
        const leadTxt = lead.length
          ? ((_rkd.served ? '' : 'Leading · ') + (_sfW ? 'High: ' : 'Low: ') + lead.map(function (L) { return L.nm.split(' ')[0]; }).join(', ') + ' ' +
             (_sfW ? _ptsTxt(lead[0]) : fmtPar(lead[0].tp)))
          : (nCards ? 'waiting on sign-off' : 'no cards yet');
        const _reo = _reopenOf(w, mus);   /* v2009 C3b: D12 */"""))
P.append(('scf-row', r"""          return '<div class="lg-sc-row lg-scf-row' + (c ? '' : ' lg-scf-row--none') + '" data-ents="' + lgEsc(L.m.a_entrant_id) + '">' +""",
r"""          /* v2009 C3b (Tyler, 11/3): D15: a week outside this player's best N is greyed and tagged */
          const _drp = !!(c && _dropped(L.m.a_entrant_id, w));
          const _drTag = _drp ? ' <span class="lg-scf-tag lg-scf-tag--drop">not counted</span>' : '';
          return '<div class="lg-sc-row lg-scf-row' + (c ? '' : ' lg-scf-row--none') + (_drp ? ' lg-scf-row--dropped' : '') + '" data-ents="' + lgEsc(L.m.a_entrant_id) + '">' +"""))
P.append(('scf-flag', r"""          const flag = !c ? '<span class="lg-scf-tag">No card</span>'
            : (c.disputed_by ? '<span class="lg-scf-tag lg-scf-tag--warn">disputed</span>'""",
r"""          const flag = !c ? '<span class="lg-scf-tag">No card</span>'
            : (c.disputed_by ? '<span class="lg-scf-tag lg-scf-tag--warn">' + (w.status === 'final' ? 'reopen requested' : 'disputed') + '</span>'   /* v2009 C3b: D12 */"""))
P.append(('scf-name', r"""            '<div class="lg-scf-who"><div class="lg-scf-nm">' + lgEsc(L.nm) + ' ' + flag + '</div>' +""",
r"""            '<div class="lg-scf-who"><div class="lg-scf-nm">' + lgEsc(L.nm) + ' ' + flag + _drTag + '</div>' +"""))
P.append(('scf-score', r"""            (c ? '<div class="lg-scf-score"><div class="lg-scf-tp">' + fmtPar(L.tp) + '</div>' +
                   '<div class="help-text lg-scf-gn">' + (_tot(c.net) == null ? '' : _tot(c.net) + ' net') + (_tot(c.gross) == null ? '' : ' · ' + _tot(c.gross) + ' gross') + '</div></div>' +""",
r"""            /* v2009 C3b (Tyler, 11/3): SCORING-5: a Stableford week shows the points it was decided on (big), net to par small */
            (c ? '<div class="lg-scf-score"><div class="lg-scf-tp">' + (_sfW && L.sf != null ? lgEsc(_ptsTxt(L)) : fmtPar(L.tp)) + '</div>' +
                   '<div class="help-text lg-scf-gn">' + (_sfW && L.sf != null ? fmtPar(L.tp) + ' · ' : '') + (_tot(c.net) == null ? '' : _tot(c.net) + ' net') + (_tot(c.gross) == null ? '' : ' · ' + _tot(c.gross) + ' gross') + '</div></div>' +"""))
P.append(('scf-sum', r"""            '<span class="help-text lg-scf-when">' + lgEsc(lgWeekWhen(w)) + (w.nine ? ' · ' + lgEsc(lgNineLabel(w.nine)) : '') + ' · ' + lgEsc(leadTxt) + '</span></span>' + pill + '</summary>' +""",
r"""            '<span class="help-text lg-scf-when">' + lgEsc(lgWeekWhen(w)) + (w.nine ? ' · ' + lgEsc(lgNineLabel(w.nine)) : '') + ' · ' + lgEsc(leadTxt) + '</span></span>' + (_reo ? _reopenPill : '') + pill + '</summary>' +"""))
P.append(('scf-help', r"""'<p class="help-text" style="margin:6px 0 8px;font-size:12px">Every card posted, week by week, ranked on net to par. Tap a week""",
r"""'<p class="help-text" style="margin:6px 0 8px;font-size:12px">Every card posted, week by week, ranked ' + (String(((sset.points || {}).system) || '') === 'stableford' ? 'on Stableford points, highest first' : 'on net to par, lowest first') + ' — a finished week in the order it was decided, card-off included. Tap a week"""))   # v2009 C3b: SCORING-5

# ---------------------------------------------------------------- D4: season prize pool pending until the final
P.append(('pot-rows', r"""      const _byRank = {};
      rows.forEach(function (r) { (_byRank[r.rank] = _byRank[r.rank] || []).push(r); });""",
r"""      /* v2009 C3b (Tyler, 11/3): D4: with playoffs on, the season prize pool pays the BRACKET result once the
         final is played -- so it is pending until then, and afterwards it splits on the playoff placings
         (champion, runner-up...), never on the regular-season table. */
      const _poPay = !!(sset.playoffs && sset.playoffs.enabled) && window._lgSeg === 'full';
      const _payRows = _poPay ? (_poPlacings || []).slice() : rows;
      const _potPending = _poPay && !_payRows.length;
      const _byRank = {};
      _payRows.forEach(function (r) { (_byRank[r.rank] = _byRank[r.rank] || []).push(r); });"""))
P.append(('pot-paid', r"""      const _paid = rows.filter(function (r) {""",
r"""      const _paid = _payRows.filter(function (r) {"""))
P.append(('pot-card', r"""      if (_paid.length) {
        h += '<div class="card"><div class="bg-sec">' + (_seasonDoneSt ? 'Season prize pool — final' : 'If the season ended today') + '</div>' +""",
r"""      if (_potPending && _pot > 0) {
        /* v2009 C3b (Tyler, 11/3): D4 */
        h += '<div class="card"><div class="bg-sec">Season prize pool — pending</div>' +
          '<p class="help-text" style="margin:6px 0 0;font-size:12px">The season prize pool is ' + lgEsc(lgMoney(_pot)) + ' — ' + _nPay + ' × ' + lgEsc(lgMoney(_fee)) +
          (_rsv > 0 ? ' less ' + lgEsc(lgMoney(_rsv)) + ' held back' : '') +
          '. This league has playoffs, so it goes on the bracket result — champion first — once the final is played. Nothing is awarded off the table above.</p></div>';
      }
      if (_paid.length) {
        h += '<div class="card"><div class="bg-sec">' + (_seasonDoneSt ? 'Season prize pool — final' : (_poPay ? 'Season prize pool — on the bracket' : 'If the season ended today')) + '</div>' +"""))
# ---------------------------------------------------------------- public page (SCORING-6, OPEN-S4, D15)
P.append(('pub-rows', r"""      ? '<div class="card">' + (function () { let last = '\u0000'; return rows.map(function (r) {
          const pct = (r.pct == null) ? '—' : (Math.round(Number(r.pct) * 10) / 10) + '%';
          const rec = [];
          if (r.wins || r.losses || r.ties) rec.push(r.wins + '-' + r.losses + '-' + r.ties);
          rec.push(r.weeks_played + ' played');""",
r"""      ? _pubChamp + _pubBest + '<div class="card">' + (function () { let last = '\u0000'; return rows.map(function (r) {
          /* v2009 C3b (Tyler, 11/3): SCORING-6: a to-par race shows the to-par total it is ranked on, and OUT
             for a player a missed week took out of it -- the same as the in-app table. */
          const _tp = (r.race || d.race) === 'to_par_total';
          const _par = function (v) { if (v == null) return '—'; const n = Number(v); return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); };
          const pct = _tp ? (r.dq ? 'OUT' : _par(r.to_par)) : ((r.pct == null) ? '—' : (Math.round(Number(r.pct) * 10) / 10) + '%');
          const rec = [];
          if (r.wins || r.losses || r.ties) rec.push(r.wins + '-' + r.losses + '-' + r.ties);
          rec.push(r.weeks_played + (_tp ? ' round' + (r.weeks_played === 1 ? '' : 's') : ' played'));
          if (_tp && r.dq) rec.push('out of the race — no card for week ' + (r.dq_week || '?'));"""))
P.append(('pub-small', r"""            '<div style="text-align:right"><div style="font-weight:800;font-size:15px">' + pct + '</div>' +
            '<div class="help-text" style="margin:0;font-size:11px">' + lgFmt(r.points) + ' / ' + lgFmt(r.points_possible) + '</div>' +""",
r"""            '<div style="text-align:right"><div style="font-weight:800;font-size:15px">' + pct + '</div>' +
            '<div class="help-text" style="margin:0;font-size:11px">' + (_tp ? (r.dq ? lgEsc(_par(r.to_par)) + ' so far' : 'through ' + lgEsc(String(r.weeks_played || 0))) : lgFmt(r.points) + ' / ' + lgFmt(r.points_possible)) + '</div>' +"""))
P.append(('pub-head', r"""function lgPublicBoardHtml(d) {
  const rows = Array.isArray(d.standings) ? d.standings : [];""",
r"""function lgPublicBoardHtml(d) {
  const rows = Array.isArray(d.standings) ? d.standings : [];
  /* v2009 C3b (Tyler, 11/3): OPEN-S4 / D4: the champion the server named (league_public_standings.playoffs,
     rank 1 first); D15: "best N of M counting". */
  let _pubChamp = '', _pubBest = '';
  try {
    const _c = (Array.isArray(d.playoffs) ? d.playoffs : []).filter(function (p) { return p && (p.champion || Number(p.rank) === 1); })[0];
    if (_c) _pubChamp = '<div class="card" style="text-align:center"><div style="font-size:18px;font-weight:800">🏆 ' + lgEsc(_c.name || '') + '</div>' +
      '<p class="help-text" style="margin:4px 0 0">Playoff champion' + ((Array.isArray(d.playoffs) && d.playoffs.length > 1) ? ' — runner-up ' + lgEsc((d.playoffs.filter(function (p) { return Number(p.rank) === 2; })[0] || {}).name || '') : '') + '</p></div>';
    const _b = rows.filter(function (r) { return r && r.best_n; })[0];
    if (_b) _pubBest = '<p class="help-text" style="text-align:center;margin:0 0 10px;font-size:12px">Best ' + Number(_b.best_n) + (_b.of_weeks ? ' of ' + Number(_b.of_weeks) : '') + ' weeks counting</p>';
  } catch (e) { _pubChamp = ''; _pubBest = ''; }"""))

# ---------------------------------------------------------------- week screen: result_json, bracket wording, D12, LIFE-13, sort
P.append(('wk-mus', r"""    return supa.from('league_matchups').select('id,kind,entrant_kind,a_entrant_id,b_entrant_id,status,a_points,b_points').eq('week_id', w.id);""",
r"""    return supa.from('league_matchups').select('id,kind,entrant_kind,a_entrant_id,b_entrant_id,status,a_points,b_points,result_json').eq('week_id', w.id);   /* v2009 C3b (Tyler, 11/3): + result_json (OPEN-S5 bracket record, field position) */"""))
P.append(('wk-cards', r"""        .select('id,matchup_id,member_id,entrant_id,gross,net,handicap_used,witness_count,posted_by,approved_at,auto_approved,disputed_by,game_code,source,course_name,course_pars,net_to_par')""",
r"""        .select('id,matchup_id,member_id,entrant_id,gross,net,handicap_used,witness_count,posted_by,approved_at,auto_approved,disputed_by,dispute_note,game_code,source,course_name,course_pars,net_to_par')   /* v2009 C3b: + dispute_note (D12) */"""))
P.append(('wk-pill', r"""    '<span class="bg-pill">' + lgEsc(w.status) + '</span></div>' +""",
r"""    '<span class="bg-pill">' + lgEsc(w.status) + '</span>' +
    (lgReopenRequested(w, cards) ? ' <span class="lg-reopen-pill">reopen requested</span>' : '') + '</div>' +   /* v2009 C3b (Tyler, 11/3): D12 */"""))
P.append(('wk-match', r"""          const aw = fin && ap > bp, bw = fin && bp > ap;
          const line = function (nm, net, won) {""",
r"""          let aw = fin && ap > bp, bw = fin && bp > ap;
          /* v2009 C3b (Tyler, 11/3): OPEN-S5: a playoff fixture level on points was decided on net or seed */
          let _resTxt = fin ? ((aw ? lgEsc(a) + ' won' : (bw ? lgEsc(b) + ' won' : 'Halved')) + ' · ' + ap + '–' + bp) : '';
          try {
            if (fin && w.is_playoff) {
              const br = lgBracketResult(m, function (id) { return _entName(m, id); });
              if (br && br.winner) { aw = br.winner === m.a_entrant_id; bw = br.winner === m.b_entrant_id; _resTxt = lgEsc(br.text); }
            }
          } catch (e) {}
          const line = function (nm, net, won) {"""))
P.append(('wk-match-txt', r"""                (fin ? (aw ? lgEsc(a) + ' won' : (bw ? lgEsc(b) + ' won' : 'Halved')) + ' · ' + ap + '–' + bp : lgEsc(m.status || 'not started')) + '</div>' +""",
r"""                (fin ? _resTxt : lgEsc(m.status || 'not started')) + '</div>' +"""))
P.append(('wk-mycard', r"""      const st = myCard.disputed_by ? 'Disputed — the commissioner will sort it out'""",
r"""      const st = myCard.disputed_by ? (w.status === 'final' ? 'Reopen requested — the results stand until the commissioner reopens the week' : 'Disputed — the commissioner will sort it out')   /* v2009 C3b: D12 */"""))
P.append(('wk-missing', r"""  try { window._lgWeekMissing = null; } catch (e) {}
  if (amCommish && (open || w.status === 'final')) {
    const missing = members.filter(function (m) {
      if (m.status !== 'active') return false;
      if (cards.filter(function (c) { return c.member_id === m.id; })[0]) return false;
      return !!mus.filter(function (x) {
        return x.kind !== 'bye' && (x.a_entrant_id === m.id || x.b_entrant_id === m.id); })[0];
    });""",
r"""  try { window._lgWeekMissing = null; } catch (e) {}
  if (amCommish && (open || w.status === 'final')) {
    /* v2009 C3b (Tyler, 11/3): LIFE-13: who is missing is built per ENTRANT / SEAT from the fixtures, the way
       league_finalize_week sees it. Keyed on member ids it listed nobody in a team league (entrants are team
       ids) and listed a player whose SUB had posted for him. */
    let _trule = '';
    try {
      const _ss = w.settings_snapshot || {};
      _trule = String(_ss.team_rule || (String(_ss.format || '') === 'scramble' ? 'scramble' : 'bestball'));
    } catch (e) {}
    const missing = lgWeekMissingSeats(mus, cards, members, absences, teamNameOf, _trule).map(function (x) {
      return { id: x.memberId, display_name: x.name, partner: !!x.partner };
    });
    try { window._lgWeekMissingRule = _trule; } catch (e) {}"""))
P.append(('wk-missing-act', r"""            (open && selfOn
              ? lgCardActionsHtml(m.id, m.display_name)   /* v1603: Pick a round · Enter card */""",
r"""            (open && selfOn && m.id
              ? lgCardActionsHtml(m.id, m.display_name)   /* v1603: Pick a round · Enter card (v2009 C3b: the seat holder) */"""))
P.append(('wk-reopen-card', r"""      (w.status === 'final'
        ? '<p class="help-text" style="margin:12px 0 6px">This week is finished and counted.</p>' +""",
r"""      (w.status === 'final'
        ? '<p class="help-text" style="margin:12px 0 6px">This week is finished and counted.</p>' +
          /* v2009 C3b (Tyler, 11/3): D12: a player's query on a final week is a reopen request; it stands until he reopens */
          (function () {
            const _rq = lgReopenRequested(w, cards);
            if (!_rq) return '';
            const _who = _rq.cards.map(function (c) { return nameOf[c.member_id] || 'a player'; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
            return '<div class="help-text" style="margin:0 0 8px;padding:8px 10px;border:1px dashed #b7791f;border-radius:10px">' +
              '<span class="lg-reopen-pill">reopen requested</span> ' +
              lgEsc('A query on ' + (_who.length ? _who.join(', ') + '’s card' : 'this week') + (_rq.note ? ': “' + _rq.note + '”' : '') +
              '. The results stand until you reopen the week.') + '</div>';
          })() +"""))
P.append(('wk-insofar', r"""      done.sort(function (a, b) { return (total(a.net) || 999) - (total(b.net) || 999); }).map(function (c) {""",
r"""      /* v2009 C3b (Tyler, 11/3): sorted on the season's measure. A final field week is in the server's order
         (result_json.position); otherwise Stableford points high first, else net to par low first (an away
         card on its own par), never raw net. */
      (function () {
        try {
          const _ss = w.settings_snapshot || {};
          const _sf = String(((_ss.points || {}).system) || '') === 'stableford';
          const _pos = function (c) { const m = mus.filter(function (x) { return x.id === c.matchup_id; })[0]; const p = m && m.result_json && parseInt(m.result_json.position, 10); return isFinite(p) && p > 0 ? p : null; };
          const _sfv = function (c) { const m = mus.filter(function (x) { return x.id === c.matchup_id; })[0]; const v = m && m.result_json && m.result_json.stableford; return (v == null || v === '') ? null : Number(v); };
          const _tp = function (c) { return (c.net_to_par != null && c.net_to_par !== '') ? Number(c.net_to_par) : (total(c.net) == null ? 1e9 : total(c.net)); };
          return done.sort(function (a, b) {
            const pa = _pos(a), pb = _pos(b);
            if (pa != null && pb != null && pa !== pb) return pa - pb;
            if (_sf) { const sa = _sfv(a), sb = _sfv(b); if (sa != null && sb != null && sa !== sb) return sb - sa; }
            return _tp(a) - _tp(b);
          });
        } catch (e) { return done.sort(function (a, b) { return (total(a.net) || 999) - (total(b.net) || 999); }); }
      })().map(function (c) {"""))

# ---------------------------------------------------------------- POOLS-9: Where everyone stands = Unit Totals
P.append(('pools9', r"""        let W = null;
        try { W = bgNetsWhole(Object.fromEntries(members.map(function (m) { return [m.member_id, Number(m.net) || 0]; })), members.map(function (m) { return { id: m.member_id }; })); } catch (e) { W = null; }
        return members.map(function (m) {
          const v = (W && typeof W[m.member_id] === 'number') ? W[m.member_id] : m.net;
          return _row(m.name, v, _owes(Number(v)));
        }).join('');""",
r"""        let W = null;
        /* v2009 C3b (Tyler, 11/3): POOLS-9: while the league holds money the members alone are not zero-sum, so
           the league's holding is a party, rounded exactly as league_money_settle rounds Unit Totals. */
        let _LW = null;
        /* S3 v2009 (REQUESTS_S3 R3): league_money_settle returns members[].whole -- the Unit Totals figures
           themselves. Read them first; lgLeagueWhole (the same rule) covers an older server. */
        try {
          const _sm = Array.isArray(st.members) ? st.members : [];
          if (_sm.length && _sm.every(function (x) { return x && x.member_id != null && typeof x.whole === 'number'; })) {
            _LW = { byId: {}, league: Number(st.to_the_league) || 0 };
            _sm.forEach(function (x) { _LW.byId[String(x.member_id)] = x.whole; });
          }
        } catch (e) { _LW = null; }
        if (!_LW) { try { _LW = lgLeagueWhole(members, pots); } catch (e) { _LW = null; } }
        if (!_LW) { try { W = bgNetsWhole(Object.fromEntries(members.map(function (m) { return [m.member_id, Number(m.net) || 0]; })), members.map(function (m) { return { id: m.member_id }; })); } catch (e) { W = null; } }
        return members.map(function (m) {
          const v = (_LW && typeof _LW.byId[String(m.member_id)] === 'number') ? _LW.byId[String(m.member_id)]
                  : ((W && typeof W[m.member_id] === 'number') ? W[m.member_id] : m.net);
          return _row(m.name, v, _owes(Number(v)));
        }).join('') +
        ((_LW && _LW.league) ? _row('The league', _LW.league, _LW.league > 0 ? 'holding it — the league fee and any pot nobody has won yet' : 'owes the players') : '');"""))


# ---------------------------------------------------------------- POOLS-3 / S3 R5: tied CTP / LP / LD on the week screen
P.append(('pot-select', r"""          return supa.from('league_pool_winners').select('kind,hole,member_id,set_by').eq('week_id', w.id);
        }, 'lgOpenWeek:pools');
        if (_pr.ok && Array.isArray(_pr.data)) _won = _pr.data;""",
r"""          return supa.from('league_pool_winners').select('kind,hole,member_id,set_by,co_member_ids').eq('week_id', w.id);
        }, 'lgOpenWeek:pools');
        if (_pr.ok && Array.isArray(_pr.data)) _won = _pr.data;
        /* v2009 C3b (Tyler, 11/3): POOLS-3: co_member_ids is new (S2_01 / S3_01). A server without it refuses the
           column, so read the old shape rather than lose the panel. */
        if (!_pr.ok) {
          const _pr0 = await _bgRead(function () {
            return supa.from('league_pool_winners').select('kind,hole,member_id,set_by').eq('week_id', w.id);
          }, 'lgOpenWeek:pools0');
          if (_pr0.ok && Array.isArray(_pr0.data)) _won = _pr0.data;
        }"""))
P.append(('pot-row', r"""        const _w = _winOf(kind, hole);
        const _who = _w ? (nameOf[_w.member_id] || '—') : null;""",
r"""        const _w = _winOf(kind, hole);
        /* v2009 C3b (Tyler, 11/3): POOLS-3: an exact tie splits the pot evenly -- show every name, and let the
           commissioner record one (league_set_pool_winner_tie, S3). */
        const _co = (_w && Array.isArray(_w.co_member_ids)) ? _w.co_member_ids.filter(Boolean) : [];
        const _all = _w ? [_w.member_id].concat(_co) : [];
        const _who = _w ? (_co.length ? 'tie: ' + _all.map(function (id) { return nameOf[id] || '—'; }).join(', ') : (nameOf[_w.member_id] || '—')) : null;
        const _tieId = 'lg-tie-' + kind + '-' + (hole == null ? 'x' : hole);
        const _tieHtml = amCommish
          ? '<details class="lg-tie"' + (_co.length ? ' open' : '') + '><summary class="help-text lg-tie-sum">It was an exact tie — split it</summary>' +
            '<div id="' + _tieId + '" class="lg-tie-list">' +
            members.filter(function (m) { return m.status === 'active'; }).map(function (m) {
              return '<label class="lg-tie-opt"><input type="checkbox" value="' + lgEsc(m.id) + '"' + (_all.indexOf(m.id) >= 0 ? ' checked' : '') + '> ' + lgEsc(m.display_name) + '</label>';
            }).join('') + '</div>' +
            '<button type="button" class="bg-btn bg-btn--sm small" onclick="lgSetPotTie(\'' + lgJs(w.id) + '\',\'' + lgJs(kind) + '\',' + (hole == null ? 'null' : hole) + ',\'' + _tieId + '\')">Save the tie</button></details>'
          : '';"""))
P.append(('pot-row-sel', r"""              _opts(_w ? _w.member_id : '') + '</select>'
            : '') +
          '</div>';
      };""",
r"""              _opts(_w ? _w.member_id : '') + '</select>'
            : '') +
          _tieHtml +   /* v2009 C3b: POOLS-3 */
          '</div>';
      };"""))
P.append(('pot-tie-fn', r"""window.lgSetPotWinner = lgSetPotWinner;""",
r"""window.lgSetPotWinner = lgSetPotWinner;
/* v2009 C3b (Tyler, 11/3): POOLS-3 / S3 R5: record an exact CTP / Long Putt / Long Drive tie. Two or more
   ticked = a tie (the pot splits evenly); one = that player; none = cleared. */
async function lgSetPotTie(weekId, kind, hole, listId) {
  if (!weekId || !kind) return;
  let ids = [];
  try {
    const el = document.getElementById(listId);
    const bs = el ? el.querySelectorAll('input[type=checkbox]') : [];
    for (let i = 0; i < bs.length; i++) if (bs[i].checked && bs[i].value) ids.push(bs[i].value);
  } catch (e) { ids = []; }
  if (ids.length < 2) { return lgSetPotWinner(weekId, kind, hole, ids[0] || null); }
  let res = null;
  try {
    res = await supa.rpc('league_set_pool_winner_tie', { p_week_id: weekId, p_kind: kind, p_member_ids: ids,
      p_hole: (hole == null || hole === '') ? null : Number(hole) });
  } catch (e) { res = { data: null, error: e }; }
  if (!res || res.error) {
    try { console.warn('league_set_pool_winner_tie failed:', res && res.error); } catch (e) {}
    try { showToast(lgErrText(res && res.error, 'Couldn’t save the tie')); } catch (e) {}
    return;
  }
  try { showToast('Tie saved — the pot splits ' + ids.length + ' ways'); } catch (e) {}
  try { lgOpenWeek(window._lgSeason, weekId); } catch (e) {}
}
window.lgSetPotTie = lgSetPotTie;"""))
P.append(('css-tie', r""".lg-scf-row--dropped { opacity: .55; }""",
r""".lg-scf-row--dropped { opacity: .55; }
  .lg-tie { margin-top: 6px; }
  .lg-tie-sum { cursor: pointer; font-size: 12px; margin: 0; }
  .lg-tie-list { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 6px 0 8px; font-size: 14px; }
  .lg-tie-opt { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; }"""))


P.append(('wk-missing-store', r"""    try { window._lgWeekMissing = { wid: w.id, names: missing.map(function (m) { return m.display_name; }) }; } catch (e) {}""",
r"""    try { window._lgWeekMissing = { wid: w.id, names: missing.map(function (m) { return m.display_name; }),
      /* v2009 C3b (Tyler, 11/3): LIFE-13: which of them are a partner on a team that still has a card */
      partners: missing.filter(function (m) { return m.partner; }).map(function (m) { return m.display_name; }), rule: window._lgWeekMissingRule || '' }; } catch (e) {}"""))
P.append(('fin-prompt', r"""  try {
    if (_miss.length) {
      const _who = _miss.length === 1 ? _miss[0]""",
r"""  /* v2009 C3b (Tyler, 11/3): LIFE-13 / D5: a team partner with no card does not cost the team the week -- the
     team plays on (best ball: the partner's card; aggregate: net double bogey on every hole for him). */
  let _part = [], _rule = '';
  try { const _m2 = window._lgWeekMissing; if (_m2 && _m2.wid === wid) { _part = (_m2.partners || []).filter(Boolean); _rule = String(_m2.rule || ''); } } catch (e) {}
  const _partNote = _part.length
    ? '\n\n' + (_part.length === 1 ? _part[0] + '’s team plays' : 'Their teams play') + ' on ' +
      (_rule === 'aggregate' ? 'with net double bogey on every hole for the missing partner.' : 'the partner’s card.')
    : '';
  try {
    if (_miss.length && _part.length === _miss.length) {
      ok = await uiConfirm((_miss.length === 1 ? _miss[0] + ' is' : _miss.join(', ') + ' are') + ' missing a score for week ' + n + '.' + _partNote + '\n\nFinalize anyway?',
        { title: 'Missing score' + (_miss.length === 1 ? '' : 's'), okLabel: 'Finalize', cancelLabel: 'Wait' });
    } else if (_miss.length) {
      const _who = _miss.length === 1 ? _miss[0]"""))
P.append(('fin-prompt2', r"""        'Finalize anyway? ' + (_miss.length === 1 ? 'They get' : 'They each get') + ' no score for the week — 0 points, and the standings update without ' + (_miss.length === 1 ? 'them' : 'them') + '.',""",
r"""        'Finalize anyway? ' + (_miss.length === 1 ? 'They get' : 'They each get') + ' no score for the week — 0 points, and the standings update without ' + (_miss.length === 1 ? 'them' : 'them') + '.' + _partNote,"""))

def apply(path):
    s = open(path, encoding='utf-8').read()
    if MARK in s:
        print('%s: already patched (marker found) -- nothing done' % os.path.relpath(path, ROOT))
        return False
    for label, old, new in P:
        n = s.count(old)
        assert n == 1, '%s: [%s] expected 1 occurrence, found %d' % (os.path.relpath(path, ROOT), label, n)
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(s)
    print('%s: %d patches applied' % (os.path.relpath(path, ROOT), len(P)))
    return True


if __name__ == '__main__':
    for f in FILES:
        apply(f)
