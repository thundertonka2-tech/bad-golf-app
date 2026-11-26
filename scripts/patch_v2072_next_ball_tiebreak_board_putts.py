#!/usr/bin/env python3
"""v2072 (Tyler, 11/26):
1. "I want to add a new option to team low ball/team best ball ... if a team ties on the hole the tie breaker goes to
   the next lowest score for that team. So if me and Kevin both got pars but Rolo and Steve got a par and bogey, we
   would win the tie. Make this change for regular games and tournament games."
   Option `nextBall` (off by default):
     - Team Match Play: a tied hole goes to the team with the better second ball (then third, fourth on bigger
       teams; every ball level = halved). A ball that was not written down loses to any score.
     - Team Low Ball 2-man: tied totals go to the lower second-ball total (fewer missing second balls first), then on down.
     - 4-man Best Ball v the field and the event Best Ball Pool: carts / teams tied for the low total are split the same way.
   Cup points on a team day follow the same winner.
2. "The answer to this is yes": the Board's "Putts & GIR tracked" block follows the v2071 rule -- putts / greens are
   listed only when a game pays on them (fairways, sand and mulligans are untouched).

    python scripts/patch_v2072_next_ball_tiebreak_board_putts.py
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2071', 'v2026.11.2072'

HELPERS = r"""/* v2072 (Tyler, 11/26): "if a team ties on the hole the tie breaker goes to the next lowest score for that team."
   bgNextBallHole: one hole -- <0 side A takes the tied hole, >0 side B, 0 still level. Second ball first, then the
   third and fourth on bigger teams; a ball that was not written down loses to any score.
   bgNextBallKey / bgNextBallCmp: the same rule for a TOTAL (Team Low Ball, 4-man Best Ball, the Best Ball Pool):
   level by level, fewer missing balls first, then the lower sum of that ball over the holes counted. */
function bgNextBallHole(aVals, bVals) {
  try {
    const srt = v => (v || []).filter(x => x != null).map(Number).sort((x, y) => x - y);
    const a = srt(aVals), b = srt(bVals), n = Math.max(a.length, b.length);
    for (let i = 1; i < n; i++) {
      const x = a[i], y = b[i];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x !== y) return x < y ? -1 : 1;
    }
  } catch (e) {}
  return 0;
}
function bgNextBallKey(ballsByHole) {
  const lv = [];
  try {
    const holes = (ballsByHole || []).filter(b => Array.isArray(b)).map(b => b.filter(x => x != null).map(Number).sort((x, y) => x - y));
    let n = 0; holes.forEach(b => { if (b.length > n) n = b.length; });
    for (let k = 1; k < n; k++) {
      let miss = 0, sum = 0;
      holes.forEach(b => { if (b[k] == null) miss++; else sum += b[k]; });
      lv.push({ miss: miss, sum: sum });
    }
  } catch (e) {}
  return lv;
}
function bgNextBallCmp(ka, kb) {
  try {
    ka = ka || []; kb = kb || [];
    const n = Math.max(ka.length, kb.length);
    for (let i = 0; i < n; i++) {
      const x = ka[i], y = kb[i];
      if (!x && !y) return 0;
      if (!x) return 1;
      if (!y) return -1;
      if (x.miss !== y.miss) return x.miss < y.miss ? -1 : 1;
      if (x.sum !== y.sum) return x.sum < y.sum ? -1 : 1;
    }
  } catch (e) {}
  return 0;
}
"""

# (name, function-scope or None, old, new)
EDITS = [
  ('helpers', None,
   "function calcTeamMatch(g) {\n",
   HELPERS + "function calcTeamMatch(g) {\n"),
  ('tm-hole', 'calcTeamMatch',
   """    else halved++;
    holes.push({ hole: h + 1, aBest, bBest, res });""",
   """    else {
      const _nb = cfg.nextBall ? bgNextBallHole(aVals, bVals) : 0;   // v2072: a tied hole goes to the next lowest score
      if (_nb < 0) { aHolesWon++; res = 'a'; _tbH++; } else if (_nb > 0) { bHolesWon++; res = 'b'; _tbH++; } else halved++;
      if (_nb) { holes.push({ hole: h + 1, aBest, bBest, res, tb: true }); continue; }
    }
    holes.push({ hole: h + 1, aBest, bBest, res });"""),
  ('tm-decl', 'calcTeamMatch',
   """  let aHolesWon = 0, bHolesWon = 0, halved = 0;""",
   """  let aHolesWon = 0, bHolesWon = 0, halved = 0, _tbH = 0;"""),
  ('tm-result', 'calcTeamMatch',
   """    winner: null,
    holes
  };""",
   """    winner: null,
    holes, nextBall: !!cfg.nextBall, tbHoles: _tbH   // v2072
  };"""),
  ('lb-decl', 'calcTeamLowball',
   """  let aTotal = 0, bTotal = 0;
  let complete = true;""",
   """  let aTotal = 0, bTotal = 0;
  const _aBalls = [], _bBalls = [];   // v2072: every ball on the holes counted, for the next-ball tie-breaker
  let complete = true;"""),
  ('lb-loop', 'calcTeamLowball',
   """    bTotal += Math.min(...bVals);
  }""",
   """    bTotal += Math.min(...bVals);
    _aBalls.push(aVals.slice()); _bBalls.push(bVals.slice());
  }"""),
  ('lb-tb', 'calcTeamLowball',
   """  if (complete && _lbLeft) {""",
   """  /* v2072 (Tyler, 11/26): tied totals go to the lower second-ball total (then third, fourth) when the option is on. */
  let _tb = 0;
  try { if (complete && !_lbLeft && aTotal === bTotal && cfg.nextBall) _tb = bgNextBallCmp(bgNextBallKey(_aBalls), bgNextBallKey(_bBalls)); } catch (e) { _tb = 0; }
  result.nextBall = !!cfg.nextBall; result.tieBreak = _tb < 0 ? 'A' : (_tb > 0 ? 'B' : null);
  if (complete && _lbLeft) {"""),
  ('lb-a', 'calcTeamLowball',
   """    if (aTotal < bTotal) {""",
   """    if (aTotal < bTotal || _tb < 0) {"""),
  ('lb-b', 'calcTeamLowball',
   """    } else if (bTotal < aTotal) {""",
   """    } else if (bTotal < aTotal || _tb > 0) {"""),
  ('lb4-decl', 'calcTeamLowball4man',
   """  let teamTotal = 0, parTotal = 0, played = 0;""",
   """  let teamTotal = 0, parTotal = 0, played = 0;
  const _balls = [];   // v2072"""),
  ('lb4-loop', 'calcTeamLowball4man',
   """    teamTotal += Math.min(...vals);""",
   """    teamTotal += Math.min(...vals);
    _balls.push(vals.slice());"""),
  ('lb4-result', 'calcTeamLowball4man',
   """    aTotal: teamTotal, bTotal: 0, teamTotal, parTotal, played, complete: played > 0, winner: null } };""",
   """    aTotal: teamTotal, bTotal: 0, teamTotal, parTotal, played, complete: played > 0, winner: null, balls: _balls, nextBall: !!cfg.nextBall } };"""),
  ('field4-side', '_t2ComputeFieldCartTeam',
   """      side('cart:' + String(g.code || ((g.t2 && g.t2.group) || '?')), r.result.teamTotal, r.result.played, g.players);""",
   """      side('cart:' + String(g.code || ((g.t2 && g.t2.group) || '?')), r.result.teamTotal, r.result.played, g.players);
      try { if (KEY === 'teamLowball') { const _S = D.sides['cart:' + String(g.code || ((g.t2 && g.t2.group) || '?'))]; _S.nbKey = bgNextBallKey(r.result.balls || []); if (cfg.nextBall) D.nextBall = true; } } catch (e) {}   // v2072"""),
  ('field4-win', '_t2ComputeFieldCartTeam',
   """        const winners = ranked.filter(s => s.total === best);""",
   """        let winners = ranked.filter(s => s.total === best);
        if (D.nextBall && winners.length > 1) {   // v2072: carts tied for the low total go to their next lowest scores
          try { const _top = winners.filter(s => winners.every(o => bgNextBallCmp(s.nbKey, o.nbKey) <= 0)); if (_top.length && _top.length < winners.length) { winners = _top; winners.forEach(s => { s.tbWin = true; }); } } catch (e) {}
        }"""),
  ('field4-day', '_t2ComputeFieldCartTeam',
   """      perDay.push({ day: day, mode: D.mode, value: val, complete: complete,""",
   """      perDay.push({ day: day, nextBall: !!D.nextBall, mode: D.mode, value: val, complete: complete,"""),
  ('cup-lowball', None,
   """push(sw(games.teamLowball, _sideLeft(games.teamLowball, split(rr.aTotal < rr.bTotal, rr.bTotal < rr.aTotal))),""",
   """push(sw(games.teamLowball, _sideLeft(games.teamLowball, split(rr.aTotal < rr.bTotal || rr.tieBreak === 'A', rr.bTotal < rr.aTotal || rr.tieBreak === 'B'))),"""),
  ('pool-team', '_bgT2TeamBestBallDays',
   """{ key: tk, vals: new Array(18).fill(null), pars: new Array(18).fill(null), players: [] });""",
   """{ key: tk, vals: new Array(18).fill(null), pars: new Array(18).fill(null), players: [], balls: Array.from({ length: 18 }, () => []) });"""),
  ('pool-ball', '_bgT2TeamBestBallDays',
   """        if (T.vals[h] == null || v < T.vals[h]) T.vals[h] = v;""",
   """        try { T.balls[h].push(v); } catch (e) {}   // v2072
        if (T.vals[h] == null || v < T.vals[h]) T.vals[h] = v;"""),
  ('pool-ret', '_bgT2TeamBestBallDays',
   """  return { byDay: byDay, net: useNet, buyin: Number(cfg.buyin) || 0 };""",
   """  return { byDay: byDay, net: useNet, buyin: Number(cfg.buyin) || 0, nextBall: !!cfg.nextBall };"""),
  ('pool-win', 't2ComputeFieldTeamBestBall',
   """        winners = ranked.filter(T => T.total === best);""",
   """        winners = ranked.filter(T => T.total === best);
        if (B.nextBall && winners.length > 1) {   // v2072: teams tied for the low total go to their next lowest scores
          try {
            const _k = T => T._nbKey || (T._nbKey = bgNextBallKey((T.balls || []).map((b, h) => (T.vals[h] != null ? b : null))));
            const _top = winners.filter(T => winners.every(O => bgNextBallCmp(_k(T), _k(O)) <= 0));
            if (_top.length && _top.length < winners.length) { winners = _top; _tbDay = true; }
          } catch (e) {}
        }"""),
  ('pool-decl', 't2ComputeFieldTeamBestBall',
   """      let winners = [];""",
   """      let winners = [], _tbDay = false;"""),
  ('pool-day', 't2ComputeFieldTeamBestBall',
   """        winners: winners.map(T => T.key),""",
   """        winners: winners.map(T => T.key), nextBall: !!B.nextBall, tieBreak: _tbDay,"""),
  ('pool-card-text', '_t2TeamBestBallHtml',
   """'; a tie splits it.' + (d.complete ? '' : ' Still live.')""",
   """(d.nextBall ? '; a tie goes to the next lowest scores, then splits.' : '; a tie splits it.') + (d.complete ? '' : ' Still live.')"""),
  ('pool-card-win', '_t2TeamBestBallHtml',
   """(d.winners.length > 1 ? 'Tied for first' : 'Winner')""",
   """(d.winners.length > 1 ? 'Tied for first' : (d.tieBreak ? 'Winner on the next ball' : 'Winner'))"""),
  ('pool-cfg-ui', 'openTourneyBestBallConfig',
   """        '</select></div>' +
        '<div style="font-weight:700;margin:6px 0 4px">Teams</div>' + list +""",
   """        '</select></div>' +
        '<div class="field"><label for="tbb-next">Tied for the low total</label><select id="tbb-next">' +
          '<option value="off"' + (bc.nextBall ? '' : ' selected') + '>Split the pool</option>' +
          '<option value="on"' + (bc.nextBall ? ' selected' : '') + '>Next lowest scores break the tie</option>' +
        '</select></div>' +
        '<div style="font-weight:700;margin:6px 0 4px">Teams</div>' + list +"""),
  ('pool-cfg-save', 'openTourneyBestBallConfig',
   """net: ov.querySelector('#tbb-net').value !== 'gross' };""",
   """net: ov.querySelector('#tbb-net').value !== 'gross', nextBall: !!(ov.querySelector('#tbb-next') && ov.querySelector('#tbb-next').value === 'on') };"""),
  ('ui-tm', None,
   """            <div class="team-picker-section" data-game="teamMatch">""",
   """            <div class="field" style="margin-top:8px">
              <label for="team-match-nextball">Tied hole</label>
              <select id="team-match-nextball">
                <option value="off">Halved</option>
                <option value="on">Next lowest score wins the hole</option>
              </select>
            </div>
            <div class="team-picker-section" data-game="teamMatch">"""),
  ('ui-lb', None,
   """            <div class="field" style="margin-top:8px">
              <label for="team-lowball-teamfmt">Team format</label>""",
   """            <div class="field" style="margin-top:8px">
              <label for="team-lowball-nextball">Tied totals</label>
              <select id="team-lowball-nextball">
                <option value="off">Tie</option>
                <option value="on">Next lowest scores break the tie</option>
              </select>
            </div>
            <div class="field" style="margin-top:8px">
              <label for="team-lowball-teamfmt">Team format</label>"""),
  ('ui-load', None,
   """  // Team match
  if (games.teamMatch) {
    if (games.teamMatch.value != null) $('team-match-value').value = games.teamMatch.value;""",
   """  // v2072: the next-ball tie-breaker, off unless the saved game has it
  try { if ($('team-match-nextball')) $('team-match-nextball').value = (games.teamMatch && games.teamMatch.nextBall) ? 'on' : 'off'; } catch (e) {}
  try { if ($('team-lowball-nextball')) $('team-lowball-nextball').value = (games.teamLowball && games.teamLowball.nextBall) ? 'on' : 'off'; } catch (e) {}
  // Team match
  if (games.teamMatch) {
    if (games.teamMatch.value != null) $('team-match-value').value = games.teamMatch.value;"""),
  ('ui-save', None,
   """  // v1764: Shamble - two even teams, best 1 or 2 net balls per hole, own handicap allowance""",
   """  // v2072: the next-ball tie-breaker (regular rounds and Configure Day alike)
  try { if (games.teamMatch && $('team-match-nextball') && $('team-match-nextball').value === 'on') games.teamMatch.nextBall = true; } catch (e) {}
  try { if (games.teamLowball && $('team-lowball-nextball') && $('team-lowball-nextball').value === 'on') games.teamLowball.nextBall = true; } catch (e) {}
  // v1764: Shamble - two even teams, best 1 or 2 net balls per hole, own handicap allowance"""),
  ('ui-help-tm', None,
   """Each hole goes to the team with the lower best-ball score; team with most holes won at the end wins the match.""",
   """Each hole goes to the team with the lower best-ball score; team with most holes won at the end wins the match. With "Next lowest score wins the hole", a tied hole goes to the team with the better second ball."""),
  ('ui-help-lb', None,
   """2-man: even teams. Each team's score is the sum of their best-ball on each hole; lowest 18-hole total wins.""",
   """2-man: even teams. Each team's score is the sum of their best-ball on each hole; lowest 18-hole total wins. With "Next lowest scores break the tie", tied totals go to the team with the lower second-ball total."""),
  ('rules-tm', None,
   """that team wins the hole if they\\'re lower. Same match-play rules as individual match.'""",
   """that team wins the hole if they\\'re lower. Same match-play rules as individual match. Optional: a tied hole goes to the team with the better second ball.'"""),
  ('board-tm', None,
   """Team match (${g.games.teamMatch.value} per player)</span>""",
   """Team match (${g.games.teamMatch.value} per player${g.games.teamMatch.nextBall ? ' · tied hole to the next ball' : ''})</span>"""),
  ('board-tm-line', None,
   """        line = `${escapeHtml(r.winner)} won ${winningHoles}-${losingHoles}${r.halved ? ` (${r.halved} halved)` : ''}`;""",
   """        line = `${escapeHtml(r.winner)} won ${winningHoles}-${losingHoles}${r.halved ? ` (${r.halved} halved)` : ''}${r.tbHoles ? ` · ${r.tbHoles} on the next ball` : ''}`;"""),
  ('board-lb', None,
   """Team low ball (${g.games.teamLowball.value} per player)</span>""",
   """Team low ball (${g.games.teamLowball.value} per player${g.games.teamLowball.nextBall ? ' · ties to the next ball' : ''})</span>"""),
  ('board-lb-line', None,
   """        line = `${escapeHtml(r.teamA)} ${r.aTotal} — ${r.bTotal} ${escapeHtml(r.teamB)} → ${escapeHtml(r.winner)} wins`;
      }
    } else {
      line = `${escapeHtml(r.teamA)} ${r.aTotal || '—'} — ${r.bTotal || '—'} ${escapeHtml(r.teamB)} (thru ${r.played})`;
    }
    div.innerHTML += `<div class="sub">${line}</div>`;
    gr.appendChild(div);
  }

  // v1764: Shamble result card""",
   """        line = `${escapeHtml(r.teamA)} ${r.aTotal} — ${r.bTotal} ${escapeHtml(r.teamB)} → ${escapeHtml(r.winner)} wins${r.tieBreak ? ' on the next ball' : ''}`;
      }
    } else {
      line = `${escapeHtml(r.teamA)} ${r.aTotal || '—'} — ${r.bTotal || '—'} ${escapeHtml(r.teamB)} (thru ${r.played})`;
    }
    div.innerHTML += `<div class="sub">${line}</div>`;
    gr.appendChild(div);
  }

  // v1764: Shamble result card"""),
  ('hole-line', None,
   """          const won = hs.res === 'a' ? t1 + ' win the hole' : (hs.res === 'b' ? t2 + ' win the hole' : 'halved');
          out.push(t1 + ' ' + hs.aBest + ' · ' + t2 + ' ' + hs.bBest + ' — ' + won);""",
   """          const won = hs.res === 'a' ? t1 + ' win the hole' : (hs.res === 'b' ? t2 + ' win the hole' : 'halved');
          out.push(t1 + ' ' + hs.aBest + ' · ' + t2 + ' ' + hs.bBest + ' — ' + won + (hs.tb ? ' on the next ball' : ''));"""),
  # ---- Board: putts / GIR only when a game pays on them ----
  ('board-putts', None,
   """  const puttsUsed = !!g.trackPutts && g.players.some(p => ((g.puttsData && g.puttsData[p.id]) || []).some(v => v != null));
  const fwUsed = !!g.trackFairways""",
   """  /* v2072 (Tyler, 11/26, "the answer to this is yes"): the v2071 rule here too -- putts / greens are listed only when a game pays on them. */
  let _sbu = { putts: true, gir: true };
  try { const _c = window._t2CrossGps; _sbu = bgStatBetUse([g], (_c && g.t2 && _c.tid === g.t2.tournamentId) ? _c.t : null); } catch (e) {}
  const puttsUsed = _sbu.putts && !!g.trackPutts && g.players.some(p => ((g.puttsData && g.puttsData[p.id]) || []).some(v => v != null));
  const fwUsed = !!g.trackFairways"""),
  ('board-gir', None,
   """  const girUsed = !!g.trackGirs && g.players.some(p => {
    const sc = (g.scores && g.scores[p.id]) || [];""",
   """  const girUsed = _sbu.gir && !!g.trackGirs && g.players.some(p => {
    const sc = (g.scores && g.scores[p.id]) || [];"""),
  ('field-sig', None,
   """function _t2BuildFieldPuttsGirHtml(raw) {
  const rounds = (raw || []).map(row => row && row.data ? row.data : row).filter(rg => rg && Array.isArray(rg.players) && rg.players.length);""",
   """function _t2BuildFieldPuttsGirHtml(raw, t) {
  const rounds = (raw || []).map(row => row && row.data ? row.data : row).filter(rg => rg && Array.isArray(rg.players) && rg.players.length);
  let _sbu = { putts: true, gir: true }; try { _sbu = bgStatBetUse(rounds, t || null); } catch (e) {}   // v2072"""),
  ('field-putts', '_t2BuildFieldPuttsGirHtml',
   """    const puttsUsed = !!rg.trackPutts &&""",
   """    const puttsUsed = _sbu.putts && !!rg.trackPutts &&"""),
  ('field-gir', '_t2BuildFieldPuttsGirHtml',
   """    const girUsed = !!rg.trackGirs &&""",
   """    const girUsed = _sbu.gir && !!rg.trackGirs &&"""),
  ('field-call', None,
   """    const html = _t2BuildFieldPuttsGirHtml(raw);""",
   """    const html = _t2BuildFieldPuttsGirHtml(raw, t);"""),
]

def scope(src, fname):
    m = re.search(r'\n(?:async )?function ' + re.escape(fname) + r'\(', src)
    assert m, 'no function ' + fname
    s = m.start() + 1
    e = re.compile(r'\n(?:async )?function [A-Za-z_$][\w$]*\(').search(src, s + 10)
    return s, (e.start() + 1 if e else len(src))

def main():
    for f in FILES:
        src = open(f, encoding='utf-8', newline='').read()
        crlf = '\r\n' in src
        if crlf: src = src.replace('\r\n', '\n')
        for name, fn, old, new in EDITS:
            if fn:
                s, e = scope(src, fn)
                body = src[s:e]
                c = body.count(old)
                assert c == 1, '%s: %s matched %d times in %s' % (os.path.basename(f), name, c, fn)
                src = src[:s] + body.replace(old, new) + src[e:]
            else:
                c = src.count(old)
                assert c == 1, '%s: %s matched %d times' % (os.path.basename(f), name, c)
                src = src.replace(old, new)
        assert src.count(OLD_V) == 2, '%s: version markers %d' % (f, src.count(OLD_V))
        src = src.replace(OLD_V, NEW_V)
        if crlf: src = src.replace('\n', '\r\n')
        open(f, 'w', encoding='utf-8', newline='').write(src)
        print('patched', os.path.relpath(f, ROOT))

if __name__ == '__main__':
    main()
