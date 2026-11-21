#!/usr/bin/env python3
"""v2057 (Tyler 11/20, midnight): on the event page's Matches tab, (1) every waiting / dropped line names the game and
the stakes ("Nassau · 10 a side · net — Tyler v Tommy: waiting for the cart to start"), and (2) a "Group games" list
shows each cart's own games (the 3-way Nassau, Wolf...) with their terms, before the start (from settings.groupGames,
mapped to the group by its players) and after (from the cards). Applies to the v2056 files; one match per edit."""
import sys
OLD_V, NEW_V = 'v2026.11.2056', 'v2026.11.2057'
EDITS = [
  # ---- engine: carry the terms on waiting / dropped rows ----------------------------------------
  ('terms-early',
   "        const kind = c.kind === 'match' ? 'match' : (names.length === 2 ? 'nassau' : 'nassauGroup');\n",
   "        const kind = c.kind === 'match' ? 'match' : (names.length === 2 ? 'nassau' : 'nassauGroup');\n        const tmE = terms(c, kind);   // v2057: the terms ride on waiting / dropped rows so the notes can name the game and the stakes\n"),
  ('terms-pend-null',
   "out.dropped.push({ day: null, kind: kind, names: names.slice(), keys: keys, reason: 'cart-not-started', text: vs(names) + ': waiting for the cart to start', pending: true, settled: false }); }",
   "out.dropped.push({ day: null, kind: kind, names: names.slice(), keys: keys, terms: tmE, reason: 'cart-not-started', text: vs(names) + ': waiting for the cart to start', pending: true, settled: false }); }"),
  ('terms-never',
   "else drop(null, kind, names, 'cart-not-started', vs(names) + ': that cart never started — no bet', { keys: keys });",
   "else drop(null, kind, names, 'cart-not-started', vs(names) + ': that cart never started — no bet', { keys: keys, terms: tmE });"),
  ('terms-pend-day',
   "if (waiting) { out.pendingAny = true; out.dropped.push({ day: c.day, kind: kind, names: names.slice(), keys: keys, reason: 'cart-not-started', text: vs(names) + ': waiting for the cart to start', pending: true, settled: false }); }\n          else drop(c.day, kind, names, 'name-not-found', vs(names) + ': ' + missing.join(', ') + ' ' + (missing.length === 1 ? 'is' : 'are') + ' not on any card' + (oneDay ? '' : ' on day ' + c.day) + ' — game dropped', { keys: keys });",
   "if (waiting) { out.pendingAny = true; out.dropped.push({ day: c.day, kind: kind, names: names.slice(), keys: keys, terms: tmE, reason: 'cart-not-started', text: vs(names) + ': waiting for the cart to start', pending: true, settled: false }); }\n          else drop(c.day, kind, names, 'name-not-found', vs(names) + ': ' + missing.join(', ') + ' ' + (missing.length === 1 ? 'is' : 'are') + ' not on any card' + (oneDay ? '' : ' on day ' + c.day) + ' — game dropped', { keys: keys, terms: tmE });"),
  ('terms-xb-pend',
   "'’s group to start', pending: true, settled: false }); return; }",
   "'’s group to start', pending: true, settled: false, terms: Object.assign({}, tm, { xkind: kind }) }); return; }"),
  ('terms-xb-drop',
   "drop(c.day, kind, names, 'name-not-found', vs(names) + ' (' + lbl + '): ' + missing.join(', ') + ' ' + (missing.length === 1 ? 'is' : 'are') + ' not on any card' + (oneDay ? '' : ' on day ' + c.day) + ' — game dropped', { keys: keys }); return;",
   "drop(c.day, kind, names, 'name-not-found', vs(names) + ' (' + lbl + '): ' + missing.join(', ') + ' ' + (missing.length === 1 ? 'is' : 'are') + ' not on any card' + (oneDay ? '' : ' on day ' + c.day) + ' — game dropped', { keys: keys, terms: Object.assign({}, tm, { xkind: kind }) }); return;"),
  # ---- the note text: game + stakes first ------------------------------------------------------
  ('note-text',
   "    return _sT(String(d.text || ((d.names || []).join(' v ') + ': game dropped')));\n  } catch (e) { return ''; }\n}\n",
   "    // v2057 (Tyler): say which game and what it is playing for -- \"Nassau · 10 a side · net — Tyler v Tommy: waiting for the cart to start\"\n"
   "    let pre = '';\n"
   "    try {\n"
   "      const tm = d.terms;\n"
   "      if (tm && typeof tm === 'object') {\n"
   "        const k = tm.xkind || d.kind;\n"
   "        const many = (d.names || []).length >= 3;\n"
   "        const nm = k === 'match' ? _sT('Match play') : k === 'stroke' ? _sT('Stroke play') : k === 'quota' ? _sT('Quota') : (_sT('Nassau') + (many ? ' (' + d.names.length + '-way)' : ''));\n"
   "        const v = Number(tm.value) || 0;\n"
   "        const amt = v ? (String(v) + ((k === 'stroke' || k === 'quota') ? (tm.per ? (k === 'quota' ? _sT(' per point') : _sT(' per stroke')) : '') : ((k === 'nassau' || k === 'nassauGroup' || d.kind === 'nassau' || d.kind === 'nassauGroup') && k !== 'match' ? _sT(' a side') : ''))) : '';\n"
   "        const ng = k === 'quota' ? '' : (tm.net === false ? _sT('gross') : _sT('net'));\n"
   "        pre = (typeof bgGameIconPrefix === 'function' ? bgGameIconPrefix(k === 'nassauGroup' ? 'nassau' : k) : '') + [nm, amt, ng].filter(Boolean).join(' · ') + ' — ';\n"
   "      }\n"
   "    } catch (e) { pre = ''; }\n"
   "    return pre + _sT(String(d.text || ((d.names || []).join(' v ') + ': game dropped')));\n  } catch (e) { return ''; }\n}\n"
   "/* v2057 (Tyler 11/20: \"now I don't see the Nassau between me, Steve and Gregory\"): each cart's OWN games on the event\n"
   "   page's Matches tab, with the game, the stakes and the players. Before the start they come from settings.groupGames\n"
   "   (keyed by group id -- mapped to the group by its players); once the cards exist, from each card's games. */\n"
   "function bgEvpGroupGamesHtml(D) {\n"
   "  try {\n"
   "    if (!D) return '';\n"
   "    const esc = (typeof t2esc === 'function') ? t2esc : (s => String(s == null ? '' : s));\n"
   "    const K = s => { try { return normalizeNameSegment(String(s || '')); } catch (e) { return String(s || '').toLowerCase(); } };\n"
   "    const lbl = k => (typeof _orGameLabel === 'function') ? _orGameLabel(k) : String(k);\n"
   "    const SKIP = new Set(['longPutt', 'ctp', 'longDrive']);\n"
   "    const who = cfg => { let p = []; if (Array.isArray(cfg.participantNames) && cfg.participantNames.length) p = cfg.participantNames.slice(); else if (Array.isArray(cfg.instances)) cfg.instances.forEach(i => { if (i && Array.isArray(i.participantNames)) p = p.concat(i.participantNames); else if (i && Array.isArray(i.pair)) p = p.concat(i.pair); }); else if (Array.isArray(cfg.pair)) p = cfg.pair.slice(); const s = new Set(); return p.filter(n => { const k = K(n); if (!n || s.has(k)) return false; s.add(k); return true; }); };\n"
   "    const termsOf = (k, cfg) => { const v = (cfg.value != null && cfg.value !== '') ? Number(cfg.value) : (cfg.buyin != null ? Number(cfg.buyin) : null); const o = []; if (v) o.push(String(v) + (k === 'nassau' ? ' a side' : '')); if (k === 'nassau' || k === 'match' || k === 'stroke' || k === 'quota') o.push(cfg.net === false ? 'gross' : 'net'); if (k === 'nassau') o.push(cfg.segments === 'fb' ? 'front & back' : 'front, back & overall'); return o.join(' · '); };\n"
   "    const items = [];   // { group, day, k, cfg }\n"
   "    const rounds = Array.isArray(D.rounds) ? D.rounds.filter(g => g && Array.isArray(g.players)) : [];\n"
   "    if (rounds.length) {\n"
   "      rounds.forEach(g => { ['games', 'groupGames'].forEach(b => { const bag = g[b]; if (!bag || typeof bag !== 'object') return; Object.keys(bag).forEach(k => { const cfg = bag[k]; if (!cfg || typeof cfg !== 'object' || SKIP.has(k) || cfg.fieldOnly || cfg._t2field) return; items.push({ group: (g.t2 && g.t2.group) || '?', day: Number((g.t2 && g.t2.day) || 1), k: k, cfg: cfg }); }); }); });\n"
   "    } else {\n"
   "      const gg = (D.game_settings && D.game_settings.groupGames) || {};\n"
   "      const groups = []; (Array.isArray(D.days) ? D.days : []).forEach(d => (Array.isArray(d.groups) ? d.groups : []).forEach(g => groups.push({ n: g.n, day: Number(d.day || 1), keys: new Set((g.players || []).map(K)) })));\n"
   "      Object.keys(gg).forEach(gid => { const bag = gg[gid]; if (!bag || typeof bag !== 'object') return; Object.keys(bag).forEach(k => { const cfg = bag[k]; if (!cfg || typeof cfg !== 'object' || SKIP.has(k)) return; const ws = who(cfg).map(K); const grp = ws.length ? groups.find(x => ws.every(w => x.keys.has(w))) : null; items.push({ group: grp ? grp.n : '?', day: grp ? grp.day : 1, k: k, cfg: cfg }); }); });\n"
   "    }\n"
   "    if (!items.length) return '';\n"
   "    items.sort((a, b) => (a.day - b.day) || (String(a.group).localeCompare(String(b.group), undefined, { numeric: true })) || String(a.k).localeCompare(String(b.k)));\n"
   "    const multiDay = new Set(items.map(i => i.day)).size > 1;\n"
   "    let h = '<div class=\"evp-sec\" style=\"margin-top:14px\">' + esc(_sT('Group games')) + '</div><div class=\"evp-card\">';\n"
   "    items.forEach(it => {\n"
   "      const ic = (typeof bgGameIconPrefix === 'function') ? bgGameIconPrefix(it.k) : '';\n"
   "      const names = who(it.cfg);\n"
   "      const tm = termsOf(it.k, it.cfg);\n"
   "      h += '<div class=\"evp-row\" style=\"grid-template-columns:minmax(0,1fr)\"><span class=\"n\" style=\"white-space:normal;overflow-wrap:anywhere\">' + esc((multiDay ? _sT('Day') + ' ' + it.day + ' · ' : '') + _sT('Group') + ' ' + it.group) + ' · ' + ic + esc(lbl(it.k)) + (tm ? ' <span style=\"color:var(--text-muted);font-weight:400\">· ' + esc(tm) + '</span>' : '')\n"
   "        + (names.length ? '<br><span style=\"color:var(--text-muted);font-weight:400;font-size:13px\">' + esc(names.join(', ')) + '</span>' : '') + '</span></div>';\n"
   "    });\n"
   "    h += '</div><div class=\"small-text\" style=\"color:var(--text-muted);margin-top:4px\">' + esc(_sT('Each group’s own games settle inside that group; the matches above settle across groups.')) + '</div>';\n"
   "    return h;\n"
   "  } catch (e) { return ''; }\n"
   "}\n"),
  # ---- the event page's Matches tab: + Group games ----------------------------------------------
  ('evp-matches',
   "    } else if (S.tab === 'matches') {\n      h += ((C.models && C.models.length) || (C.models && C.models.notes && C.models.notes.length)) ? (   /* v2010 (decision 6) */'<div class=\"evp-card evp-sc\" style=\"padding:8px\">' + t2EventMatchesHtml(C.models) + '</div>') : '<p class=\"help-text\" style=\"padding:20px 0;text-align:center\">No matches in this event.</p>';\n",
   "    } else if (S.tab === 'matches') {\n      h += ((C.models && C.models.length) || (C.models && C.models.notes && C.models.notes.length)) ? (   /* v2010 (decision 6) */'<div class=\"evp-card evp-sc\" style=\"padding:8px\">' + t2EventMatchesHtml(C.models) + '</div>') : '<p class=\"help-text\" style=\"padding:20px 0;text-align:center\">No matches in this event.</p>';\n"
   "      try { h += bgEvpGroupGamesHtml(D) || ''; } catch (e) {}   // v2057: each cart's own games, with the stakes\n"),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]
def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old); assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src); print('patched', path, len(EDITS), 'edits')
for p in sys.argv[1:]: patch(p)
