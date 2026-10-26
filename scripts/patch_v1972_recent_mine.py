#!/usr/bin/env python3
"""v1972 — course pickers' ⏱ Recent only counts rounds *I* played (Tyler: 'recents showing courses I have never played')."""
import sys
EDITS = []
# shared helper, placed right after getRecent()
EDITS.append(("""// Rebuild a round's per-player "scoreLine" as GROSS from a saved game (same
// first-name + gross-total format addToRecent uses).""",
"""/* v1972 (Tyler, 10/26): "my recents are still showing courses I have never played. It is
   taking the recent from all players and not just me." The Rounds list (recent:<uid>) also
   holds rounds an admin opened for someone else (Sebastian's Saddle Rock, Pat's Windance),
   and every course picker built ⏱ Recent off it without asking whether I was IN the round.
   One source for "rounds I actually played": the Rounds list filtered by the same test the
   Rounds tab uses (uid on the row first, then any name that means me). A player name can be
   passed for the Stats "someone else's round" pickers. */
async function bgRecentMine(playerName) {
  let rows = [];
  try { rows = await getRecent(); } catch (e) { rows = []; }
  let who = playerName || null;
  if (!who) { try { who = await getMeName(); } catch (e) { who = null; } }
  if (!who) { try { who = (bgMyNames() || [])[0] || null; } catch (e) { who = null; } }
  if (!who) return rows;   // signed-out / unnamed: the list is already only this device's rounds
  const _norm = s => normalizeNameSegment(String(s || ''));
  const _byName = r => { try { return String(r.players || '').split(',').some(n => _norm(n) === _norm(who)); } catch (e) { return false; } };
  return (rows || []).filter(r => {
    if (!r) return false;
    if (playerName) return _byName(r);                       // asking about a specific player
    try { return recentRowHasName(r, who); } catch (e) { return _byName(r); }
  });
}
// Rebuild a round's per-player "scoreLine" as GROSS from a saved game (same
// first-name + gross-total format addToRecent uses).""", "helper"))
# round-setup picker
EDITS.append(("""      const recentGames = await getRecent(); // newest-first rounds you played
      const recents = [];""",
"""      const recentGames = await bgRecentMine(); // v1972: newest-first rounds *I* played
      const recents = [];""", "setup picker"))
# tournament picker
EDITS.append(("""      const recentGames = (typeof getRecent === 'function') ? (await getRecent()) : [];
      for (const g of (recentGames || [])) {
        if (!g) continue;
        let libc = null;""",
"""      const recentGames = (typeof bgRecentMine === 'function') ? (await bgRecentMine()) : [];   // v1972: rounds I played
      for (const g of (recentGames || [])) {
        if (!g) continue;
        let libc = null;""", "tourney picker"))
# played-courses helper (Stats past-round + switch-kit)
EDITS.append(("""    const games = (typeof getRecent === 'function') ? (await getRecent()) : [];
    (games || []).forEach((g, i) => {
      if (!g) return;
      stamped.push({ id: g.courseId || null, name: (g.course || '').trim(), ts: g.updatedAt || g.createdAt || _ts(g.date) || (Date.now() - i) });""",
"""    const games = (typeof bgRecentMine === 'function') ? (await bgRecentMine(playerName || null)) : [];   // v1972: only rounds this player was in
    (games || []).forEach((g, i) => {
      if (!g) return;
      stamped.push({ id: g.courseId || null, name: (g.course || '').trim(), ts: g.updatedAt || g.createdAt || _ts(g.date) || (Date.now() - i) });""", "played helper"))
def patch(p):
    s = open(p, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = s.count(old); assert n == 1, f'{p}: {name}: {n}'
        s = s.replace(old, new)
    s = s.replace("<!--BGVER=v2026.11.1971-->", "<!--BGVER=v2026.11.1972-->").replace("const BG_BUILD = 'v2026.11.1971';", "const BG_BUILD = 'v2026.11.1972';")
    assert s.count('v2026.11.1972') == 2
    open(p, 'w', encoding='utf-8', newline='\n').write(s); print(p, 'ok')
for p in sys.argv[1:]: patch(p)
