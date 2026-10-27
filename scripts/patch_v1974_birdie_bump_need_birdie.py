#!/usr/bin/env python3
"""v1974 — Birdie Bump option: only players who make at least one birdie are in the bet (casual + tournament)."""
import sys
EDITS = []
# 1. setup form (shared by casual and tournament day games)
EDITS.append(("""            <div class="help-text" style="margin-top:8px">
              Each player who makes a birdie/eagle/HIO takes that amount from every other participant. Reads straight from the scorecard — no manual tagging needed.""",
"""            <label class="game-toggle" style="flex-direction:row;text-align:left;min-height:0;margin-top:8px;align-items:center;gap:8px">
              <input type="checkbox" id="birdiePool-need-birdie" class="bg-ck" style="width:auto;margin:0">
              <div style="flex:1"><div class="name" style="font-size:13px">No birdie, no bet</div><div class="desc">Only players who make at least one birdie (or better) are in. Anyone who goes birdie-less pays nothing and collects nothing.</div></div>
            </label>
            <div class="help-text" style="margin-top:8px">
              Each player who makes a birdie/eagle/HIO takes that amount from every other participant. Reads straight from the scorecard — no manual tagging needed.""", "form"))
# 2. collector
EDITS.append(("""      hio: parseFloat($('birdiePool-hio').value) || 0,
      birdieBasis: ($('birdiePool-birdie-basis') && $('birdiePool-birdie-basis').value === 'net') ? 'net' : 'gross'
    };""",
"""      hio: parseFloat($('birdiePool-hio').value) || 0,
      birdieBasis: ($('birdiePool-birdie-basis') && $('birdiePool-birdie-basis').value === 'net') ? 'net' : 'gross',
      needBirdie: !!($('birdiePool-need-birdie') && $('birdiePool-need-birdie').checked)   // v1974 (Tyler, 10/27): no birdie, no bet
    };""", "collect"))
# 3. restore
EDITS.append(("""    if (bp.birdieBasis && $('birdiePool-birdie-basis')) $('birdiePool-birdie-basis').value = bp.birdieBasis;""",
"""    if (bp.birdieBasis && $('birdiePool-birdie-basis')) $('birdiePool-birdie-basis').value = bp.birdieBasis;
    if ($('birdiePool-need-birdie')) $('birdiePool-need-birdie').checked = !!bp.needBirdie;   // v1974""", "restore"))
# 4. help text
EDITS.append(("""    body: 'Scores per great shot, no tracking required — the calc reads it straight from your scorecard. Configure 3 unit values: birdie, eagle, and hole-in-one. Each player who makes one takes that amount from every other participant.'""",
"""    body: 'Scores per great shot, no tracking required — the calc reads it straight from your scorecard. Configure 3 unit values: birdie, eagle, and hole-in-one. Each player who makes one takes that amount from every other participant. Turn on "No birdie, no bet" and only players who make at least one birdie are in: a birdie-less player pays nothing and collects nothing.'""", "help"))
# 5. group engine: two passes when needBirdie
EDITS.append(("""  const _useNetBP = (cfg.birdieBasis === 'net') && !!g.sis;
  const _bpParts0 = participants;
  for (let h = 0; h < 18; h++) {
    const par = g.pars[h];
    if (par == null) continue;
    const participants = bgHoleParts(g, _bpParts0, h + 1);   // v1602: birdies after he left cost him nothing
    participants.forEach(p => {""",
"""  const _useNetBP = (cfg.birdieBasis === 'net') && !!g.sis;
  const _bpParts0 = participants;
  /* v1974 (Tyler, 10/27): "You only get included in Birdie Bump if you have one birdie or
     more during the round. If you get no birdies, you are removed from the bet." With
     needBirdie on, the awards are read first; anyone with none is out -- they neither pay
     nor collect -- and each award is then taken from the other QUALIFIED players only.
     Live, a player drops in the moment they make their first birdie. */
  const _needB = !!cfg.needBirdie;
  const _awards = [];   // {h, p, kind, amount, parts}
  for (let h = 0; h < 18; h++) {
    const par = g.pars[h];
    if (par == null) continue;
    const participants = bgHoleParts(g, _bpParts0, h + 1);   // v1602: birdies after he left cost him nothing
    participants.forEach(p => {""", "engine head"))
EDITS.append(("""      if (!kind || amount === 0) return;
      // Player takes `amount` from each OTHER participant
      const others = participants.filter(o => o.id !== p.id);
      money[p.id] += amount * others.length;
      others.forEach(o => { money[o.id] -= amount; });
      events.push({ hole: h + 1, player: p.name, kind, amount, totalGain: amount * others.length });
    });
  }
  return { money, events };
}""",
"""      if (!kind || amount === 0) return;
      _awards.push({ h: h, p: p, kind: kind, amount: amount, parts: participants });
    });
  }
  const _qual = _needB ? new Set(_awards.map(a => a.p.id)) : null;
  _awards.forEach(a => {
    // Player takes `amount` from each OTHER participant (v1974: each other QUALIFIED participant)
    const others = a.parts.filter(o => o.id !== a.p.id && (!_qual || _qual.has(o.id)));
    money[a.p.id] += a.amount * others.length;
    others.forEach(o => { money[o.id] -= a.amount; });
    events.push({ hole: a.h + 1, player: a.p.name, kind: a.kind, amount: a.amount, totalGain: a.amount * others.length });
  });
  return { money, events, needBirdie: _needB, out: _qual ? participants.filter(p => !_qual.has(p.id)).map(p => p.name) : [] };
}""", "engine tail"))
# 6. field engine: two passes
EDITS.append(("""      const money = {}, made = {};
      players.forEach(x => { money[x.key] = 0; made[x.key] = 0; });
      const events = [];
      players.forEach(x => {
        const g = x.g, p = x.p;""",
"""      const money = {}, made = {};
      players.forEach(x => { money[x.key] = 0; made[x.key] = 0; });
      const events = [];
      /* v1974 (Tyler, 10/27): "No birdie, no bet" -- read every award first, then settle
         each one across the players who made at least one. A birdie-less player is out
         of the day's bump: pays nothing, collects nothing, listed with 0. */
      const _needB = !!cfg.needBirdie;
      const _awards = [];
      players.forEach(x => {
        const g = x.g, p = x.p;""", "field head"))
EDITS.append(("""          if (!kind || !amount) continue;
          money[x.key] += amount * (N - 1);
          players.forEach(o => { if (o.key !== x.key) money[o.key] -= amount; });
          made[x.key]++;
          events.push({ day: Number(day), hole: h + 1, name: x.name, first: x.first, kind: kind, amount: amount, pot: amount * (N - 1), group: (g.t2 && g.t2.group) || null });
        }
      });""",
"""          if (!kind || !amount) continue;
          made[x.key]++;
          _awards.push({ x: x, g: g, h: h, kind: kind, amount: amount });
        }
      });
      const _qual = _needB ? players.filter(o => made[o.key] > 0) : players;
      const _qualN = _qual.length;
      _awards.forEach(a => {
        const x = a.x, g = a.g;
        money[x.key] += a.amount * (_qualN - 1);
        _qual.forEach(o => { if (o.key !== x.key) money[o.key] -= a.amount; });
        events.push({ day: Number(day), hole: a.h + 1, name: x.name, first: x.first, kind: a.kind, amount: a.amount, pot: a.amount * (_qualN - 1), group: (g.t2 && g.t2.group) || null });
      });
      events.sort((a, b) => a.hole - b.hole);""", "field tail"))
EDITS.append(("""      const rowsOut = players.map(x => ({ name: x.name, first: x.first, money: complete ? money[x.key] : 0, made: made[x.key] }))""",
"""      const rowsOut = players.map(x => ({ name: x.name, first: x.first, money: complete ? money[x.key] : 0, made: made[x.key], out: _needB && !made[x.key] }))   // v1974: out = birdie-less under "no birdie, no bet\"""", "field rows"))
EDITS.append(("""        basis: (cfg.birdieBasis === 'net') ? 'net' : 'gross',
        events: events.sort((a, b) => a.hole - b.hole), rows: rowsOut""",
"""        basis: (cfg.birdieBasis === 'net') ? 'net' : 'gross', needBirdie: _needB,
        events: events, rows: rowsOut""", "field perDay"))
def patch(p):
    s = open(p, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = s.count(old); assert n == 1, f'{p}: {name}: {n}'
        s = s.replace(old, new)
    s = s.replace("<!--BGVER=v2026.11.1973-->", "<!--BGVER=v2026.11.1974-->").replace("const BG_BUILD = 'v2026.11.1973';", "const BG_BUILD = 'v2026.11.1974';")
    assert s.count('v2026.11.1974') == 2
    open(p, 'w', encoding='utf-8', newline='\n').write(s); print(p, 'ok')
for p in sys.argv[1:]: patch(p)
