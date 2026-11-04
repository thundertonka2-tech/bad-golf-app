function _t2MyCrossGroupStatuses(g, myId) {
  /* v2010 (cross audit S-3/S-4/S-7/S-19): the chips READ the engine result (t2ComputeCrossGroupMatches
     over the cached event) instead of re-settling from slot arrays -- so a nine, a front/back-only
     cart, a leaver, a skipped hole and a multi-day rematch all read exactly what the Matches card and
     Units pay. Filtered to THIS round's day and keyed by bgCrossKey; the opponent label comes from the
     whole field roster ("Mike J." / "Mike B."). Short text for the bubble: "3&2", "2 up", "dormie",
     "AS" -- no "(thru)" / "- in progress" tail. Group-mode Nassau: "▲ +60 · Nassau (3)". */
  try {
    const cache = window._t2CrossGps;
    if (!cache || !cache.t || !(g && g.t2 && g.t2.tournamentId === cache.tid)) return [];
    const me = (g.players || []).find(p => p && p.id === myId); if (!me || !me.name) return [];
    const X = _t2CrossFromCache(cache, g); if (!X) return [];
    const L = X.labels;
    const myKey = _t2SKey(me.name);
    const day = Number((g.t2 && g.t2.day) || 1);
    const onDay = x => x.day == null || Number(x.day) === day;
    const cartKeys = new Set((g.players || []).filter(p => p && p.name).map(p => _t2SKey(p.name)));
    const out = [];
    const sgn = n => (n > 0 ? '+' : '−') + Math.abs(bgWhole(n));
    X.matches.forEach(m => {
      try {
        if (!onDay(m)) return;
        if (m.aKey !== myKey && m.bKey !== myKey) return;
        const oppKey = m.aKey === myKey ? m.bKey : m.aKey; if (oppKey === myKey || cartKeys.has(oppKey)) return;   // same cart = in-group
        const opp = L.first(oppKey, m.aKey === myKey ? m.bFirst : m.aFirst);
        let text, cls;
        if (m.notStarted) { text = '– · ' + opp; cls = 'even'; }
        else if (m.push || !m.winnerKey) { text = 'AS · ' + opp; cls = 'even'; }
        else {
          const mine = m.winnerKey === myKey;
          const st = m.forfeit ? _sT('forfeit') : (m.statusShort === 'dormie' ? (_t2CrossLead(m) + ' ' + _sT('dormie')) : _sT(m.statusShort || ''));
          text = (mine ? '▲ ' : '▼ ') + st + ' · ' + opp; cls = mine ? 'pos' : 'neg';
        }
        if (m.blank) text += ' · ?';
        out.push({ label: bgGameIcon('match'), text: text, cls: cls, cross: true, pending: !!m.pending });
      } catch (e) {}
    });
    X.nassaus.forEach(n => {
      try {
        if (!onDay(n)) return;
        if (n.aKey !== myKey && n.bKey !== myKey) return;
        const oppKey = n.aKey === myKey ? n.bKey : n.aKey; if (oppKey === myKey || cartKeys.has(oppKey)) return;
        const opp = L.first(oppKey, n.aKey === myKey ? n.bFirst : n.aFirst);
        const amt = n.aKey === myKey ? n.aNet : n.bNet;
        const text = (!amt ? 'AS · ' : ((amt > 0 ? '▲ ' : '▼ ') + sgn(amt) + ' · ')) + opp;
        out.push({ label: bgGameIcon('nassau'), text: text, cls: !amt ? 'even' : (amt > 0 ? 'pos' : 'neg'), cross: true, pending: !!n.pending });
      } catch (e) {}
    });
    X.nassauGroups.forEach(G => {
      try {
        if (!onDay(G) || G.keys.indexOf(myKey) < 0) return;
        const amt = Number(G.netByKey && G.netByKey[myKey]) || 0;
        const text = (!amt ? 'AS · ' : ((amt > 0 ? '▲ ' : '▼ ') + sgn(amt) + ' · ')) + 'Nassau (' + G.keys.length + ')';
        out.push({ label: bgGameIcon('nassau'), text: text, cls: !amt ? 'even' : (amt > 0 ? 'pos' : 'neg'), cross: true, pending: !!G.pending });
      } catch (e) {}
    });
    return out;
  } catch (e) { return []; }
}
