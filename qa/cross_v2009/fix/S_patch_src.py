#!/usr/bin/env python3
"""Builds S_patch.py (self-contained) from S_js_*.js. Run once: python3 S_patch_src.py"""
import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda f: open(os.path.join(HERE, f), encoding='utf-8').read()
HELP = rd('S_js_helpers.js'); GPS = rd('S_js_gps.js'); MOD = rd('S_js_models.js')
B = rd('BASE_v2009.html')

def blk(start, end):
    i = B.find(start); assert i >= 0, start[:60]
    j = B.find(end, i); assert j >= 0, end[:60]
    return B[i:j + len(end)]

E = []  # (name, old, new)

# S1 -- CSS: colour-blind classes + live/won states for the cross surfaces (S-20)
old = "  tr.sc-mu-extra .sc-mu-vs { display: block; font-size: 10px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }\n"
E.append(('S1 css: cross status classes + colour-blind (S-20)', old, old +
"""  /* v2010 (cross audit S-20): cross-bet surfaces -- status classes, and the Color-blind setting (body.bg-cb)
     swaps green/red for blue/orange on the Matches card, the cross lines, the GPS chips and Units. */
  .bg-xs { font-weight: 600; } .bg-xs-won { color: var(--accent); } .bg-xs-live { color: var(--accent); }
  .bg-xs-as { color: var(--text-muted); } .bg-xs-none { color: var(--text-muted); opacity: .75; font-weight: 500; }
  .evt-mc-note { color: var(--text-muted); }
  body.bg-cb .sc-mu-up, body.bg-cb .sc-mu-multi .sc-mu-up { color: #0072b2 !important; }
  body.bg-cb .sc-mu-dn, body.bg-cb .sc-mu-multi .sc-mu-dn { color: #d55e00 !important; }
  body.bg-cb .gps-mm.pos { color: #56b4e9 !important; } body.bg-cb .gps-mm.neg { color: #ffa040 !important; }
  body.bg-cb #bgevp .evp-urow .v.pos { color: #0072b2 !important; } body.bg-cb #bgevp .evp-urow .v.neg { color: #d55e00 !important; }
  body.bg-cb .bg-xs-won, body.bg-cb .bg-xs-live { color: #0072b2 !important; }
"""))

# S2 -- banners: replace the two v683 name-only cross branches with the event-driven block (S-1, S-7)
nas_old = blk("      if (_nassauInstCross(g, inst)) {\n        const _cn = ", "        return;\n      }\n")
E.append(('S2 renderGameBanners: Nassau cross branch defers to the event block (S-1/S-7)', nas_old,
"""      if (_nassauInstCross(g, inst)) {
        // v2010 (cross audit S-1/S-7): drawn once, from the EVENT engine, by _t2RenderCrossBanners below.
        return;
      }
"""))
m_old = blk("  // v683 (Tyler): cross-group MATCH play (1v1 across cart groups) also shows in the", "  } catch (e) {}\n")
E.append(('S3 renderGameBanners: cross lines from the engine on every cart in the bet (S-1/S-7)', m_old,
"""  // v683 (Tyler): cross-group MATCH play (1v1 across cart groups) also shows in the
  // blue box — not just Nassau. It settles on the Event Leaderboard.
  // v2010 (cross audit S-1/S-7): every cross bet a player on THIS card is in -- Match, 2-player and
  // group-mode Nassau, saved before launch or on the other cart -- with the engine's live status.
  try { if (typeof _t2RenderCrossBanners === 'function') _t2RenderCrossBanners(g, banners); } catch (e) {}
"""))

# S4 -- GPS: whole _t2MyCrossGroupStatuses replaced; helpers inserted ahead of it (S-3/S-4/S-7/S-19)
gps_old = blk("function _t2MyCrossGroupStatuses(g, myId) {", "\n    return out;\n  } catch (e) { return []; }\n}")
E.append(('S4 _t2MyCrossGroupStatuses reads the engine + shared S helpers (S-3/S-4/S-7/S-19)', gps_old, HELP.rstrip('\n') + '\n' + GPS.rstrip('\n')))

# S5 -- GPS cache refresh: drop the memoised engine result when the event rows change
old = "    window._t2CrossGps = { tid: tid, at: Date.now(), t: t, rows: rows };"
E.append(('S5 _t2RefreshCrossGpsCache: fresh rows drop the memoised engine result', old,
"    window._t2CrossGps = { tid: tid, at: Date.now(), t: t, rows: rows };   // v2010 (cross audit S-3): a new object, so _t2CrossFromCache recomputes\n"
"    try { if (t && t.id) Promise.resolve(_t2CrossStoredFetch(t.id)).catch(() => {}); } catch (e) {}   // v2010 (decision 7): stored cross results for the Matches card fallback"))

# S6 -- scorecard Match view: cross lines (decision 9)
old = "          if (list.length === 1) { rows[pid] = list[0].row; return; }"
E.append(('S6a bgMatchCardModel: a player in a cross match gets the per-match lines (decision 9)', old,
"          if (list.length === 1 && !(_scCross && _scCross[pid])) { rows[pid] = list[0].row; return; }   // v2010 (decision 9): + cross lines below"))
old = "        const multi = {};   // v1990: pid -> [{row, opp, oppName}] for a player in several matches"
E.append(('S6b bgMatchCardModel: merge the engine cross lines into the v1990 multi rows', old,
"""        // v2010 (decision 9, Tyler 11/4): cross matches join the v1990 one-line-per-match rule ("Tyler · v Kevin").
        try { if (_scCross) Object.keys(_scCross).forEach(pid => { (_scCross[pid] || []).forEach(x => { (per[pid] = per[pid] || []).push({ row: x.row, opp: null, oppName: x.oppName, cross: true }); }); }); } catch (e) {}
""" + old))
old = "          multi[pid] = list.map(x => ({ row: x.row, opp: x.opp, oppName: _firstOf(x.opp) }));"
E.append(('S6c bgMatchCardModel: cross line opponent name', old,
"          multi[pid] = list.map(x => ({ row: x.row, opp: x.opp, oppName: x.oppName || _firstOf(x.opp) }));   // v2010 (decision 9)"))
old = "          const ini = x => { const f = _firstOf(x.opp); return f ? f.charAt(0).toUpperCase() : '?'; };"
E.append(('S6d bgMatchCardModel: cross line initial', old,
"          const ini = x => { const f = x.oppName || _firstOf(x.opp); return f ? escapeHtml(f.charAt(0).toUpperCase()) : '?'; };   // v2010 (decision 9)"))
old = "'</span><small>v ' + escapeHtml(_firstOf(x.opp)) + '</small>'"
E.append(('S6e bgMatchCardModel: cross line total label', old,
"'</span><small>v ' + escapeHtml(x.oppName || _firstOf(x.opp)) + '</small>'"))
old = "    let kind = null, label = '';"
E.append(('S6f bgMatchCardModel: read the engine cross lines once', old, old +
"\n    let _scCross = null; try { _scCross = (typeof _t2ScCrossRows === 'function') ? _t2ScCrossRows(g, mkRow) : null; } catch (e) { _scCross = null; }   // v2010 (decision 9)"))
old = "    if (!kind) return null;\n    return { kind, label, rows };"
E.append(('S6g bgMatchCardModel: a card whose only matches are cross bets still gets the Match view', old,
"""    // v2010 (decision 9): no in-group match on this card, but a player is in a cross match -> the Match view
    // shows those lines (the other players read "no match", as before).
    if (!kind && _scCross && typeof _bgScCrossOnly === 'function' && _bgScCrossOnly(rows, _scCross, mkRow)) { kind = 'match'; label = 'Match play'; }
""" + old))

# S7 -- results line (S-12): mount + key-based figure from combined payouts
old = "    '<button class=\"bg-btn bg-btn--full full t2-summ-lb\">🏆 Full standings &amp; awards</button>';"
E.append(('S7a t2InjectTourneySummaryLink: add the inline mount (S-12)', old,
"    '<div class=\"t2-tourney-inline small-text\" style=\"margin-bottom:8px\"></div>' +   // v2010 (cross audit S-12): the line had no mount\n" + old))
cl_old = blk("    // Cross-group 1v1s (match + Nassau) — my net, on the tournament side.", "    if (crossNet) lines += '<div>Cross-group games: <strong style=\"color:' + col(crossNet) + '\">' + fmt(crossNet) + '</strong></div>';\n")
E.append(('S7b t2InjectTourneySummaryLink: Cross-group games line by full key, settled only, = Units (S-12)', cl_old,
"""    // Cross-group 1v1s (match + Nassau) — my net, on the tournament side.
    // v2010 (cross audit S-12): by full key (aKey/bKey/winnerKey), settled bets only -- the engine's
    // own units, the same figures the Units "Cross-group games" column adds up.
    let crossNet = 0, crossPend = false;
    try {
      const X = _t2CrossNorm(cross);
      const me = (typeof _t2SKey === 'function') ? _t2SKey(myName) : myKey;
      X.matches.forEach(m => { if (!m.settled || m.push || !m.winnerKey) { if (m.pending && (m.aKey === me || m.bKey === me)) crossPend = true; return; } if (m.winnerKey === me) crossNet += m.value; else if (m.loserKey === me || ((m.aKey === me || m.bKey === me) && m.winnerKey !== me)) crossNet -= m.value; });
      X.nassaus.forEach(n => { if (n.aKey === me) crossNet += n.aNet; else if (n.bKey === me) crossNet += n.bNet; if (n.pending && (n.aKey === me || n.bKey === me)) crossPend = true; });
      X.nassauGroups.forEach(G => { if (G.keys.indexOf(me) >= 0) { crossNet += Number(G.netByKey[me]) || 0; if (G.pending) crossPend = true; } });
    } catch (e) { crossNet = 0; }
    if (crossNet || crossPend) lines += '<div>Cross-group games: <strong class="' + (crossNet > 0 ? 'bg-xs-won' : '') + '" style="color:' + col(crossNet) + '">' + fmt(crossNet) + '</strong>' + (crossPend ? ' <span class="small-text" style="color:var(--text-muted)">(' + _sT('pending') + ')</span>' : '') + '</div>';
"""))

# S8 -- t2EventMatchModels + t2EventMatchesHtml replaced
mm_old = blk("function t2EventMatchModels(t, rows) {", "\n    return out;\n  } catch (e) { return []; }\n}")
mh_old = blk("function t2EventMatchesHtml(models) {", "    return h;\n  } catch (e) { return ''; }\n}")
i = MOD.find("function t2EventMatchesHtml(models) {")
E.append(('S8a t2EventMatchModels reads the engine (S-6/S-7/S-11/S-13/S-14, decision 7)', mm_old, MOD[:i].rstrip('\n')))
E.append(('S8b t2EventMatchesHtml: group Nassau, pending / saved tags, dropped + conflict notes', mh_old, MOD[i:].rstrip('\n')))

# S9 -- event Full scorecard: the Matches tab also shows when there are only notes
old = "    if (!_models.length || (opts && opts.strokesOnly)) return _strokes;"
E.append(('S9 _t2FieldScorecardHtml: Matches tab for dropped / conflict notes too', old,
"    if ((!_models.length && !((_models.notes || []).length)) || (opts && opts.strokesOnly)) return _strokes;   // v2010 (decision 6): a dropped bet is never silent"))

# S10 -- public page: Matches tab shows notes; Units shows dropped / conflicts and Pending (S-5 surface)
old = "      h += (C.models && C.models.length) ? ("
E.append(('S10a public Matches tab: notes-only events still render', old,
"      h += ((C.models && C.models.length) || (C.models && C.models.notes && C.models.notes.length)) ? (   /* v2010 (decision 6) */"))
old = "(x.pending && !x.v ? '<span>pending</span>' : sg(x.v))"
E.append(('S10b public Units: a pending game shows its figure AND "pending" (S-5)', old,
"(x.pending ? (x.v ? sg(x.v) + ' <span class=\"small-text\">· pending</span>' : '<span>pending</span>') : sg(x.v))   /* v2010 (cross audit S-5): settled sides so far + pending */"))
old = "        h += '</div><div class=\"small-text\" style=\"color:var(--text-muted);text-align:center\">Units · tap a player for each game</div>';"
E.append(('S10c public Units: "bet dropped" and conflict lines from the engine (decision 6, S-10)', old, old +
"""
        // v2010 (decision 6 / S-10): a cross bet that won't count, or two carts that set different terms -- never silent.
        try {
          const _L = (typeof _t2CrossLabels === 'function') ? _t2CrossLabels((D.rounds || []).map(x => ({ data: x }))) : null;
          const _dn = [].concat((pay.crossDropped || []).map(d => ({ d: d, c: false })), (pay.crossConflicts || []).map(d => ({ d: d, c: true })));
          if (_L && _dn.length) h += '<div class="evp-sec" style="margin-top:14px">' + esc(_sT('Cross-group notes')) + '</div><div class="evp-card">' + _dn.map(x => '<div class="evp-row" style="grid-template-columns:minmax(0,1fr)"><span class="n" style="white-space:normal;overflow-wrap:anywhere">⚠️ ' + esc(_t2CrossNoteText(x.d, _L, x.c ? 'conflict' : null)) + '</span></div>').join('') + '</div>';
        } catch (e) {}"""))

# S11 -- ensure the colour-blind class follows the setting whenever the event page opens
old = "  const S = _bgEvp; if (!S) return;"
E.append(('S11 _bgEvpRender: colour-blind class (S-20)', old, old + "\n  try { if (typeof _bgCbSync === 'function') _bgCbSync(); } catch (e) {}   // v2010 (cross audit S-20)"))

# S12 -- event-home cart label: the live-edit bucket (g.groupGames) names a cross bet too (S-17 label part)
old = "    collect(rd && rd.games && rd.games.nassau, 'nassau');"
E.append(('S12 _t2CrossBetCandidatesForSummary: read the live-edit groupGames bucket (S-17 label)', old, old +
"\n    collect(rd && rd.groupGames && rd.groupGames.match, 'match');     // v2010 (cross audit S-17): a live-edit pick lands in g.groupGames\n    collect(rd && rd.groupGames && rd.groupGames.nassau, 'nassau');"))

I18N = json.loads(rd('S_i18n.json'))

tpl = rd('S_patch_tpl.py')
out = tpl.replace('__EDITS__', json.dumps(E, ensure_ascii=False, indent=0)).replace('__I18N__', json.dumps(I18N, ensure_ascii=False, indent=1))
open(os.path.join(HERE, 'S_patch.py'), 'w', encoding='utf-8').write(out)
print('S_patch.py written with', len(E), 'edits')
