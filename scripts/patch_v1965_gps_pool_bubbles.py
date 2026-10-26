#!/usr/bin/env python3
"""v1965 — GPS right-stack bubbles for Birdie Bump, Skins and the prize pools (group AND field)."""
import sys

EDITS = []

# 1. field-lead cache also carries live Birdie Bump / Skins / side-pot standings for the event
EDITS.append((
"""    if (ldGps) ld = { name: ldGps.name, yds: ldGps.yds };
    const prev = window._t2FieldLead[tid] || {};
    window._t2FieldLead[tid] = { at: now, lp: lp, ld: ld, ldByDay: ldByDay, dayGames: (t && t.settings && t.settings.dayGames) || null };""",
"""    if (ldGps) ld = { name: ldGps.name, yds: ldGps.yds };
    /* v1965 (Tyler, 10/26): "Why don't I see birdie bumps on the GPS screen?" The field-wide
       games (Birdie Bump, event Skins, Low Net / GIR / Putts pools) settle across every cart,
       so a cart's own engines can't show them. Compute them here, on the same 15 s refresh,
       and gpsMyStatuses reads them by player name. */
    let fb = null, fsk = null, fsp = null;
    try { fb = (typeof t2ComputeFieldBirdiePool === 'function') ? t2ComputeFieldBirdiePool(rows) : null; } catch (e) { fb = null; }
    try { const sc = t && t.settings && t.settings.tourneySkins; fsk = (sc && sc.on && typeof t2ComputeFieldSkins === 'function') ? t2ComputeFieldSkins(rows, sc) : null; } catch (e) { fsk = null; }
    try { const pc = (typeof t2EffectiveSidePots === 'function') ? t2EffectiveSidePots(t) : null; fsp = (pc && typeof t2ComputeFieldSidePots === 'function') ? t2ComputeFieldSidePots(rows, pc) : null; } catch (e) { fsp = null; }
    const prev = window._t2FieldLead[tid] || {};
    window._t2FieldLead[tid] = { at: now, lp: lp, ld: ld, ldByDay: ldByDay, dayGames: (t && t.settings && t.settings.dayGames) || null, fb: fb, fsk: fsk, fsp: fsp };
    try { if (typeof gpsView !== 'undefined' && gpsView && typeof gpsView.refreshMatches === 'function') gpsView.refreshMatches(); } catch (e) {}""",
"field cache"))

# 2. bubbles
EDITS.append((
"""  // ---- Vegas / Dynamic Vegas — a live  chip so the game ALWAYS has a tappable""",
"""  /* v1965 (Tyler): Birdie Bump, Skins and the prize pools on the GPS stack -- "where you
     are on those bets". Group games read this cart's engines; a tournament's field games
     read the _t2FieldLead cache (refreshed every 15 s by _t2RefreshFieldLead). */
  try {
    const me = (g.players || []).find(p => p && p.id === myId);
    const myKey = me ? normalizeNameSegment(String(me.name || '')) : '';
    const tid = g.t2 && g.t2.tournamentId;
    const F = (tid && window._t2FieldLead && window._t2FieldLead[tid]) || null;
    if (tid) { try { _t2RefreshFieldLead(tid); } catch (e) {} }
    const money = v => (v > 0 ? '+' : (v < 0 ? '\\u2212' : '')) + bgWhole(Math.abs(v));
    const dayN = Number((g.t2 && g.t2.day) || 1);
    const isField = key => { try { const c = g.games && g.games[key]; return !!(c && c.fieldOnly) || !!(g.t2 && Array.isArray(g.t2.dayGameKeys) && g.t2.dayGameKeys.indexOf(key) >= 0); } catch (e) { return false; } };
    // --- Birdie Bump ---
    if (g.games && g.games.birdiePool) {
      if (isField('birdiePool')) {
        const d = F && F.fb && Array.isArray(F.fb.perDay) ? F.fb.perDay.find(x => x.day === dayN) : null;
        const row = d && Array.isArray(d.rows) ? d.rows.find(r => normalizeNameSegment(String(r.name || '')) === myKey) : null;
        if (row) {
          const made = Number(row.made) || 0;
          const best = Math.max.apply(null, d.rows.map(r => Number(r.made) || 0));
          const text = made + ' \\ud83d\\udc26' + (made && made === best ? ' \\u2022 top' : '');
          out.push({ label: bgGameIcon('birdiePool'), text: text, cls: made && made === best ? 'pos' : (made ? 'even' : 'neg') });
        } else if (F) out.push({ label: bgGameIcon('birdiePool'), text: '0 \\ud83d\\udc26', cls: 'even' });
      } else {
        const r = res && res.results && res.results.birdiePool;
        if (r && r.money && myId in r.money) {
          const v = r.money[myId] || 0;
          let mine = 0; try { const _nm = me ? me.name : null; mine = (r.events || []).filter(e => e && _nm && e.player === _nm).length; } catch (e) {}
          out.push({ label: bgGameIcon('birdiePool'), text: (mine ? mine + ' \\ud83d\\udc26 ' : '') + (v ? money(v) : 'live'), cls: v > 0 ? 'pos' : (v < 0 ? 'neg' : 'even') });
        }
      }
    }
    // --- Skins (group) ---
    try {
      const sk = res && res.results && res.results.skins;
      if (g.games && g.games.skins && sk && sk.money && myId in sk.money) {
        let won = 0; try { won = (sk.results || []).filter(x => x && x.winnerId === myId).length; } catch (e) {}
        const v = sk.money[myId] || 0;
        out.push({ label: bgGameIcon('skins'), text: won + ' skin' + (won === 1 ? '' : 's') + (v ? ' ' + money(v) : ''), cls: won ? 'pos' : (v < 0 ? 'neg' : 'even') });
      }
    } catch (e) {}
    // --- Event Skins (field) ---
    if (F && F.fsk && Array.isArray(F.fsk.perDay)) {
      const d = F.fsk.perDay.find(x => x.day === dayN);
      if (d) {
        let won = 0; try { won = (d.holeResults || []).filter(h => h && h.winnerKey === myKey).length; } catch (e) {}
        const tot = F.fsk.totalsByKey && F.fsk.totalsByKey[myKey]; const v = tot ? (Number(tot.net) || 0) : 0;
        out.push({ label: bgGameIcon('skins') + ' \\ud83c\\udfc6', text: won + ' skin' + (won === 1 ? '' : 's') + (v ? ' ' + money(v) : ''), cls: won ? 'pos' : 'even' });
      }
    }
    // --- Prize pools: my place (field pools from the cache; a group's own pools from this cart) ---
    const potLbl = { lowNet: 'lowNetPool', girs: 'girPool', putts: 'puttsPool' };
    if (F && F.fsp && Array.isArray(F.fsp.perDay)) {
      const d = F.fsp.perDay.find(x => x.day === dayN);
      (d && Array.isArray(d.pots) ? d.pots : []).forEach(pot => {
        const rows = Array.isArray(pot.rows) ? pot.rows : [];
        const i = rows.findIndex(r => normalizeNameSegment(String(r.name || '')) === myKey);
        if (i < 0) return;
        out.push({ label: bgGameIcon(potLbl[pot.key] || pot.key) + ' \\ud83c\\udfc6', text: (i === 0 ? '1st' : ord(i + 1)) + ' of ' + rows.length, cls: i === 0 ? 'pos' : 'even' });
      });
    } else {
      // The group pool engines only settle at the end; rank the live stat here instead.
      let tot = null; try { tot = (typeof calcTotals === 'function') ? calcTotals(g) : null; } catch (e) { tot = null; }
      const cnt = (map, id) => { try { return ((map && map[id]) || []).filter(v => v === true).length; } catch (e) { return 0; } };
      const sum = (map, id) => { try { return ((map && map[id]) || []).reduce((a, v) => a + (Number(v) || 0), 0); } catch (e) { return 0; } };
      [['lowNetPool', p => (tot && tot[p.id] && tot[p.id].count) ? tot[p.id].net : null, true],
       ['girPool', p => cnt(g.girsData, p.id), false],
       ['puttsPool', p => (tot && tot[p.id] && tot[p.id].count) ? sum(g.puttsData, p.id) : null, true]].forEach(([cfgKey, statOf, lowWins]) => {
        const cfg = g.games && g.games[cfgKey]; if (!cfg || cfg.fieldOnly) return;
        let parts = []; try { parts = (typeof getParticipants === 'function') ? getParticipants(g, cfg) : []; } catch (e) { parts = []; }
        if (!parts.some(p => p && p.id === myId)) return;
        const rows = parts.map(p => ({ id: p.id, v: statOf(p) })).filter(r => r.v != null);
        if (!rows.length) { out.push({ label: bgGameIcon(cfgKey), text: 'live', cls: 'even' }); return; }
        rows.sort((a, b) => lowWins ? (a.v - b.v) : (b.v - a.v));
        const i = rows.findIndex(r => r.id === myId); if (i < 0) return;
        out.push({ label: bgGameIcon(cfgKey), text: (i === 0 ? '1st' : ord(i + 1)) + ' of ' + parts.length, cls: i === 0 ? 'pos' : 'even' });
      });
    }
  } catch (e) {}
  // ---- Vegas / Dynamic Vegas — a live  chip so the game ALWAYS has a tappable""",
"bubbles"))


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
