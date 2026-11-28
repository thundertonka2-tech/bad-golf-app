#!/usr/bin/env python3
# v2026.11.2090 -- Tyler, 11/27 6:50pm (Games sheet > Tournament > "Scorecard -- whole field", Frosty Post Turkey Day):
# "on the scoring summary we are still putting quota under matches can you fix this. We need a quota tab just like
# we have for matches here."
# v2085 gave the GROUP card its own Quota tab; the EVENT card (Strokes | Matches) still listed cross-group Quota bets
# as match cards. They get their own tab now: Strokes | Matches (n) | Quota (n). Same on the event page.
import sys, io
OLD_V, NEW_V = 'v2026.11.2089', 'v2026.11.2090'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('split fn', "function _t2FieldScorecardHtml(t, rawRounds, evPlayers, opts) {\n",
        "// v2090: an event's bet cards, split the way the tabs are: Quota bets on their own, everything else (and the notes) under Matches.\n"
        "function bgEvSplitModels(models) {\n"
        "  const all = Array.isArray(models) ? models : [];\n"
        "  const q = all.filter(m => m && m.xkind === 'quota'), m = all.filter(x => !(x && x.xkind === 'quota'));\n"
        "  try { m.notes = (models && Array.isArray(models.notes)) ? models.notes : []; } catch (e) {}\n"
        "  return { matches: m, quota: q, hasMatches: m.length > 0 || (m.notes || []).length > 0 };\n"
        "}\n"
        "function _t2FieldScorecardHtml(t, rawRounds, evPlayers, opts) {\n")
    one('mode', "    let _mode = 'strokes'; try { const _ls = localStorage.getItem('golf:evscview:' + (t && t.id || '')); if (_ls === 'matches') _mode = 'matches'; } catch (e) {}\n",
        "    const _sp = bgEvSplitModels(_models);\n"
        "    let _mode = 'strokes'; try { const _ls = localStorage.getItem('golf:evscview:' + (t && t.id || '')); if (_ls === 'matches' && _sp.hasMatches) _mode = 'matches'; else if (_ls === 'quota' && _sp.quota.length) _mode = 'quota'; else if (_ls === 'matches' && _sp.quota.length) _mode = 'quota'; } catch (e) {}\n")
    one('tabs', "_tab('strokes', 'Strokes') + _tab('matches', '⚔️ Matches (' + _models.length + ')') + '</div>'",
        "_tab('strokes', 'Strokes') + (_sp.hasMatches ? _tab('matches', '⚔️ Matches (' + _sp.matches.length + ')') : '') + (_sp.quota.length ? _tab('quota', '🎯 Quota (' + _sp.quota.length + ')') : '') + '</div>'")
    one('panes', "      + '<div class=\"evt-sc-pane\" data-pane=\"matches\"' + (_mode === 'matches' ? '' : ' hidden') + '>' + t2EventMatchesHtml(_models) + '</div>'\n",
        "      + (_sp.hasMatches ? '<div class=\"evt-sc-pane\" data-pane=\"matches\"' + (_mode === 'matches' ? '' : ' hidden') + '>' + t2EventMatchesHtml(_sp.matches) + '</div>' : '')\n"
        "      + (_sp.quota.length ? '<div class=\"evt-sc-pane\" data-pane=\"quota\"' + (_mode === 'quota' ? '' : ' hidden') + '>' + t2EventMatchesHtml(_sp.quota) + '</div>' : '')\n")
    # --- the event page: Matches tab without the Quota bets, and a Quota tab when the event has any ---
    one('evp tabs', "['pools', 'Prize pools'], ['matches', 'Matches']];   /* v1947: + Prize pools */ if (photos.length) tabs.push(['photos', 'Photos']);",
        "['pools', 'Prize pools'], ['matches', 'Matches']];   /* v1947: + Prize pools */\n  try { if (S.calc && bgEvSplitModels(S.calc.models).quota.length) tabs.push(['quota', 'Quota']); else if (S.tab === 'quota') S.tab = S.calc ? 'matches' : S.tab; } catch (e) {}   // v2090: cross-group Quota bets have their own tab\n  if (photos.length) tabs.push(['photos', 'Photos']);")
    one('evp cond', "  } else if (S.tab === 'card' || S.tab === 'units' || S.tab === 'matches' || S.tab === 'pools') {\n", "  } else if (S.tab === 'card' || S.tab === 'units' || S.tab === 'matches' || S.tab === 'pools' || S.tab === 'quota') {\n")
    one('evp matches', "    } else if (S.tab === 'matches') {\n      h += ((C.models && C.models.length) || (C.models && C.models.notes && C.models.notes.length)) ? (   /* v2010 (decision 6) */'<div class=\"evp-card evp-sc\" style=\"padding:8px\">' + t2EventMatchesHtml(C.models) + '</div>')",
        "    } else if (S.tab === 'quota') {   // v2090\n      const _q = bgEvSplitModels(C.models).quota;\n      h += _q.length ? ('<div class=\"evp-card evp-sc\" style=\"padding:8px\">' + t2EventMatchesHtml(_q) + '</div>') : '<p class=\"help-text\" style=\"padding:20px 0;text-align:center\">No Quota bets in this event.</p>';\n"
        "    } else if (S.tab === 'matches') {\n      const _spE = bgEvSplitModels(C.models);\n      h += _spE.hasMatches ? (   /* v2010 (decision 6) */'<div class=\"evp-card evp-sc\" style=\"padding:8px\">' + t2EventMatchesHtml(_spE.matches) + '</div>')")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
