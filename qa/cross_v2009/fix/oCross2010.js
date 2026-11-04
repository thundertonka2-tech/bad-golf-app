'use strict';
// v2010 cross-bet oracle (stream E) for the multi-day suite -- Tyler's 11/4 DECISIONS, written from the rules, not
// from the app. Rule switches let a mismatch with the v2008 oracle be attributed to the decision that changed it.
//   R.dayBound  : a groupGames bet belongs to the day of the cart that saved it (ENG-1)
//   R.byNumber  : holes matched by hole number; Front 1-9 / Back 10-18; Total only with both nines (ENG-2, dec. 1)
//   R.holeOrder : close-out judged in hole-number order over shared holes; remaining incl. skipped holes (dec. 2, ENG-9)
//   R.leaver    : leaver loses an unfinished match / side (dec. 4, ENG-3)
//   R.blank     : a forgotten blank on a finished card never settles (ENG-7)
//   R.pendSide  : a stroke side settles only complete; Total with one nine = push (unchanged rule, kept for parity)
// Rounds are harness rounds: g.scores slot-indexed, g.startHole, g.leftRound.byId, nineMode absent (multi-nine combos
// and single nines are ordinary cards whose slot = hole number), g.t2.day / g.t2.groupId.
module.exports = function makeOCross(H) {
  const { nk, nHof, oStrokes, oPar, oSi, scoredN } = H;
  const ALL = { dayBound: true, byNumber: true, holeOrder: true, leaver: true, blank: true };
  function side(g, p, net) {
    const nH = nHof(g), st = (g.startHole >= 1 && g.startHole <= nH) ? g.startHole : 1;
    const pos = h1 => ((h1 - st) % nH + nH) % nH;
    const la = g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id];
    const byHole = {}, active = {}, forgot = {}, posOf = {};
    for (let i = 0; i < nH; i++) {
      const h = i + 1, s = (g.scores[p.id] || [])[i];
      active[h] = la == null || pos(h) <= pos(la); posOf[h] = pos(h);
      if (s != null) byHole[h] = net ? s - oStrokes(p.hcp, oSi(g, p, i), oPar(g, p, i), g.hcpRules, nH) : s;
      else if (g.finishedAt && active[h] && g.players.some(q => q.id !== p.id && (g.scores[q.id] || [])[i] != null)) forgot[h] = true;
    }
    return { byHole, active, forgot, posOf, nH, left: la != null, fin: !!g.finishedAt, g };
  }
  const val = (P, h) => P.byHole[h] == null ? null : P.byHole[h];
  const leftIn = (P, hs) => P.left && hs.some(h => !P.active[h]);
  const forgotIn = (P, hs) => hs.some(h => P.forgot[h]);
  function shared(A, B, R) {
    const n = Math.min(A.nH, B.nH); const o = []; for (let h = 1; h <= (R.byNumber ? 18 : n); h++) if (h <= A.nH && h <= B.nH) o.push(h); return o;   // slot = hole number on these cards
  }
  function match(A, B, R) {
    const S = shared(A, B, R); if (!S.length) return { a: 0, settled: true };
    let order = S.slice();
    if (!R.holeOrder) { const n = S.length; order = S.map(h => ({ h, p: Math.min(A.posOf[h], B.posOf[h]) })).sort((x, y) => x.p - y.p).map(x => x.h); }
    let aw = 0, bw = 0, played = 0, closed = false, maxP = -1;
    for (const h of order) {
      const va = val(A, h), vb = val(B, h); if (va == null || vb == null) continue;
      played++; maxP = Math.max(maxP, Math.min(A.posOf[h], B.posOf[h]));
      if (va < vb) aw++; else if (vb < va) bw++;
      const rem = R.holeOrder ? S.length - played : S.length - (maxP + 1);
      if (Math.abs(aw - bw) > rem) { closed = true; break; }
    }
    if (!played) {
      if (R.leaver) { const aL = leftIn(A, S), bL = leftIn(B, S); if (aL !== bL) { const W = aL ? B : A; if (S.every(h => val(W, h) != null)) return { a: aL ? -1 : 1, settled: true }; } }
      return { a: 0, settled: !(!A.fin || !B.fin) };
    }
    if (!closed && R.leaver) { const aL = leftIn(A, S), bL = leftIn(B, S); if (aL !== bL) { const W = aL ? B : A; if (S.every(h => val(W, h) != null)) return { a: aL ? -1 : 1, settled: true }; return { a: 0, settled: false }; } }
    let settled = closed || played >= S.length || (A.fin && B.fin);
    if (R.blank && !closed && (forgotIn(A, S) || forgotIn(B, S))) settled = false;
    if (!settled || aw === bw) return { a: 0, settled };
    return { a: aw > bw ? 1 : -1, settled: true };
  }
  function nassau(A, B, inst, R) {
    const S = shared(A, B, R), fmt = inst.format || 'stroke';
    const F = S.filter(h => h <= 9), Bk = S.filter(h => h >= 10);
    const segs = []; if (F.length) segs.push(['F', F]); if (Bk.length) segs.push(['B', Bk]); if (F.length && Bk.length && inst.segments !== 'fb') segs.push(['T', S]);
    const bothFin = A.fin && B.fin, done = hs => hs.every(h => val(A, h) != null && val(B, h) != null);
    const fD = F.length ? done(F) : false, bD = Bk.length ? done(Bk) : false;
    let a = 0, open = false;
    segs.forEach(([nm, hs]) => {
      let aw = 0, bw = 0, as = 0, bs = 0, miss = 0, played = 0;
      hs.forEach(h => { const va = val(A, h), vb = val(B, h); if (va == null || vb == null) { miss++; return; } played++; as += va; bs += vb; if (va < vb) aw++; else if (vb < va) bw++; });
      let forfeit = 0;
      if (R.leaver) { const aL = leftIn(A, hs), bL = leftIn(B, hs); if (aL !== bL) { const W = aL ? B : A; if (hs.every(h => val(W, h) != null)) forfeit = aL ? -1 : 1; } }
      if (!played && !forfeit) { if (!bothFin) open = true; return; }
      if (!forfeit && nm === 'T' && bothFin && !(fD && bD)) return;
      const closedM = fmt === 'match' && Math.abs(aw - bw) > miss;
      if (miss === 0 || closedM) { a += fmt === 'match' ? Math.sign(aw - bw) : Math.sign(bs - as); return; }
      if (forfeit) { a += forfeit; return; }
      if (!bothFin || (R.blank && (forgotIn(A, hs) || forgotIn(B, hs)))) open = true;
    });
    return { a, settled: !open };
  }
  // returns { money, pending }
  return function oCross2010(rounds, t, Rin) {
    const R = Object.assign({}, ALL, Rin || {});
    const res = {}, add = (k, v) => { if (v) res[k] = (res[k] || 0) + v; };
    let pending = false;
    const gg = (t.settings && t.settings.groupGames) || {};
    const gidDay = {}; rounds.forEach(g => { gidDay[g.t2.groupId] = g.t2.day; });
    const days = Array.from(new Set(rounds.map(g => Number(g.t2.day)))).sort((x, y) => x - y);
    const cands = []; Object.keys(gg).forEach(gid => ['match', 'nassau'].forEach(kind => { const m = gg[gid][kind]; if (m) (m.instances || [m]).forEach(i => cands.push({ kind, inst: i, day: gidDay[gid] != null ? Number(gidDay[gid]) : (days.length === 1 ? days[0] : null) })); }));
    days.forEach(day => {
      const rs = rounds.filter(g => Number(g.t2.day) === day), seat = {};
      rs.forEach(g => g.players.forEach(p => { const k = nk(p.name); if (!seat[k]) seat[k] = { g, p }; }));
      const seen = new Set();
      cands.forEach(c => {
        // a bet saved under a group id that never launched: no day yet -> pending while anything is still open
        if (R.dayBound && c.day == null) { if (rounds.some(g => !g.finishedAt)) pending = true; return; }
        if (R.dayBound && c.day !== day) return;
        const pr = (c.inst.participantNames && c.inst.participantNames.length >= 2) ? c.inst.participantNames : (c.inst.pair || []);
        if (c.kind === 'match' && pr.length !== 2) return; if (pr.length < 2) return;
        const ks = pr.map(nk); if (!ks.every(k => seat[k])) return;
        if (new Set(ks.map(k => seat[k].g)).size <= 1) return;
        const key = c.kind + '|' + ks.slice().sort().join('|'); if (seen.has(key)) return; seen.add(key);
        if (ks.length !== 2) return;   // the suite has no group-mode bets
        const net = c.inst.net !== false, v = Number(c.inst.value) || 0;
        const scA = scoredN(seat[ks[0]].g, seat[ks[0]].p), scB = scoredN(seat[ks[1]].g, seat[ks[1]].p);
        if (!scA || !scB) { if (!(seat[ks[0]].g.finishedAt && seat[ks[1]].g.finishedAt)) pending = true; if (!R.dayBound) return; return; }
        const A = side(seat[ks[0]].g, seat[ks[0]].p, net), B = side(seat[ks[1]].g, seat[ks[1]].p, net);
        const r = c.kind === 'match' ? match(A, B, R) : nassau(A, B, c.inst, R);
        if (!r.settled) pending = true;
        if (c.kind === 'match') { if (r.settled && r.a) { add(ks[0], r.a * v); add(ks[1], -r.a * v); } }
        else { add(ks[0], r.a * v); add(ks[1], -r.a * v); }
      });
    });
    return { money: res, pending };
  };
};
