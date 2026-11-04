// qa/cross_v2009/fix/oEarly.js -- ORACLE side of Tyler's "Early-finished events" rule (DECISIONS.md, 2026-11-04),
// written from the rule, not from the app. Used by the *_v2011 copies of the QA suites.
//
// Rule: when the groups of an event day stop early on different holes, every FIELD game counts only the holes
// EVERY group finished -- physical hole numbers played in every launched round of the day (a round's holes = the
// holes scored by a player who had not left; a no-show / never-teed-off round is not waited for). It applies only
// once every round of the day is finished (a round's holes = holes its group played; the director's recorded
// set, g.t2.earlyEnd.holes, wins when present) and at least one ended short of its holes; otherwise nothing changes.
// Quota targets are prorated: round(full quota x N / round holes). CTP holes outside the set are called off.
'use strict';
const nHofG = g => ((g.pars || []).filter(x => x != null).length === 9 ? 9 : 18);
const leftOf = (g, p) => !!(g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id]);
const phys = (g, i) => (g.nineMode === 'back9' ? i + 10 : i + 1);
// returns sorted physical holes, or null (no cut)
function oCommonHoles(rs) {
  const rec = rs.find(g => g && g.t2 && g.t2.earlyEnd && Array.isArray(g.t2.earlyEnd.holes) && g.t2.earlyEnd.holes.length);
  if (rec && rs.every(g => g.finishedAt || (g.t2 && g.t2.noShow))) return rec.t2.earlyEnd.holes.map(Number).sort((a, b) => a - b);
  const sets = []; let short = false;
  for (const g of rs) {
    if (!g || !Array.isArray(g.players) || !g.players.length) continue;
    const nH = nHofG(g);
    const s = new Set();
    if (g.games && g.games.scramble && g.scrambleData) {
      for (let i = 0; i < nH; i++) { const d = g.scrambleData[i + 1]; if (d && d.teamA != null) s.add(phys(g, i)); }
    } else {
      const any = g.players.some(p => ((g.scores || {})[p.id] || []).some(v => v != null && v !== ''));
      if (!any) { if (g.finishedAt || (g.t2 && g.t2.noShow)) continue; return null; }
      for (let i = 0; i < nH; i++) if (g.players.some(p => !leftOf(g, p) && ((g.scores || {})[p.id] || [])[i] != null && ((g.scores || {})[p.id] || [])[i] !== '')) s.add(phys(g, i));
    }
    if (!s.size) { if (g.finishedAt || (g.t2 && g.t2.noShow)) continue; return null; }
    if (!g.finishedAt) return null;
    if (s.size < nH) short = true;
    sets.push(s);
  }
  if (!short || !sets.length) return null;
  const out = []; for (let h = 1; h <= 18; h++) if (sets.every(s => s.has(h))) out.push(h);
  return out;
}
const dayOf = g => Number((g.t2 && g.t2.day) || 1);
// Rounds -> deep copies with each early day's rounds cut to the common holes. g._early = { holes, idx, n } on a cut round.
// Idempotent: a day that already holds a cut round is left as it is (so a flight subset of a cut field is never re-cut).
function oCutRounds(rounds) {
  const byDay = {}; rounds.forEach(g => (byDay[dayOf(g)] || (byDay[dayOf(g)] = [])).push(g));
  const cm = {}; Object.keys(byDay).forEach(d => { cm[d] = byDay[d].some(g => g && g._early) ? null : oCommonHoles(byDay[d]); });
  return rounds.map(g => {
    const C = cm[dayOf(g)]; if (!C || g._early) return g;
    const c = JSON.parse(JSON.stringify(g)); const inS = new Set(C); const nH = nHofG(c);
    const keep = i => inS.has(phys(c, i));
    const idx = []; for (let i = 0; i < nH; i++) if (keep(i)) idx.push(i);
    const cutArr = a => { if (Array.isArray(a)) for (let i = 0; i < a.length; i++) if (!keep(i)) a[i] = null; };
    Object.keys(c.scores || {}).forEach(k => cutArr(c.scores[k]));
    ['puttsData', 'girData'].forEach(m => { if (c[m]) Object.keys(c[m]).forEach(k => cutArr(c[m][k])); });
    ['ctpData', 'scrambleData'].forEach(m => { if (c[m]) Object.keys(c[m]).forEach(h => { if (!keep(Number(h) - 1)) delete c[m][h]; }); });
    if (c.games && c.games.ctp && Array.isArray(c.games.ctp.holes)) c.games.ctp.holes = c.games.ctp.holes.filter(h => keep(Number(h) - 1));
    c._early = { holes: C.slice(), idx, n: idx.length };
    return c;
  });
}
// a quota target on a cut round: round(full x N / round holes)
const oQTarget = (g, full) => (g && g._early) ? Math.round(full * g._early.n / nHofG(g)) : full;
// holes a cut card must hold to count as "full"
const oFullN = g => (g && g._early) ? g._early.n : nHofG(g);
module.exports = { oCommonHoles, oCutRounds, oQTarget, oFullN };
