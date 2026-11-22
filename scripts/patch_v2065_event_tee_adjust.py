#!/usr/bin/env python3
"""v2065 (Tyler, SR Sunday 11/22): "We all played from the White and Pops played from the Greens.
Our handicaps should have all been adjusted based on our tee."

An event round now launches on the COURSE handicap: the roster number is the player's Handicap
Index and is converted off the tee the commissioner assigned (Index x Slope/113 + Rating - Par),
exactly as a casual round does. Replaces the v1719 "no conversion at launch" rule for events.
Leagues are untouched (A10: a league handicap is entered as strokes).

    python scripts/patch_v2065_event_tee_adjust.py            # patches golf-app.html + www/index.html
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2064', 'v2026.11.2065'

EDITS = []

# 1. the helper, in front of the launcher
EDITS.append(('helper', "async function t2LaunchDayRounds(courseId) {\n", r'''/* v2065 (Tyler, SR Sunday 11/22): "We all played from the White and Pops played from the Greens. Our
   handicaps should have all been adjusted based on our tee." The roster number is the player's Handicap
   INDEX. At launch it becomes the COURSE handicap off the tee the commissioner assigned that player --
   Index x Slope/113 + (Rating - Par), the same computeCourseHcp a casual round uses (women's rating/slope by
   profile gender, the tee's own par total when the card carries one). On a nine the result is already the
   9-hole figure, so _t2DayHcpRules now stamps hcp18:false and strokesOnHole no longer halves it. A tee with
   no rating/slope, or no tee at all, plays the index as typed (halved on a nine). Replaces the v1719 "no
   conversion at launch" rule for EVENTS; leagues are untouched (A10: a league handicap is entered as strokes).
   The same number is shown as "Adj" on the Assign tees sheet and printed on the paper cards. */
function _t2CourseHcpAtLaunch(index, teeLabel, tees, pars, name) {
  try {
    const idx = Number(index); if (!isFinite(idx)) return 0;
    const nH = (Array.isArray(pars) ? pars.filter(p => p != null).length : 18) || 18;
    const nine = nH === 9;
    const list = Array.isArray(tees) ? tees : [];
    const teeObj = list.find(te => te && te.label === teeLabel) || (list.length === 1 ? list[0] : null);
    const gender = (typeof bgSetupGender === 'function') ? bgSetupGender(name) : 'M';
    const rs = teeObj ? pickTeeRS(teeObj, gender) : { rating: null, slope: null };
    if (!teeObj || !rs.slope) return bgHcpRound(nine ? idx / 2 : idx);
    let parTot = 0; try { parTot = (pars || []).reduce((a, b) => a + (Number(b) || 0), 0); } catch (e) {}
    let teePar = 0; try { if (Array.isArray(teeObj.pars) && teeObj.pars.length === nH) teePar = teeObj.pars.reduce((a, b) => a + (Number(b) || 0), 0); } catch (e) {}
    const ch = computeCourseHcp(idx, teeObj, teePar || parTot || null, gender);
    return (typeof ch === 'number' && isFinite(ch)) ? ch : bgHcpRound(nine ? idx / 2 : idx);
  } catch (e) { return Math.round(Number(index) || 0); }
}
async function t2LaunchDayRounds(courseId) {
'''))

# 2. the launcher builds each card player off the course handicap
EDITS.append(('launch', '''      const h = Math.round(parseFloat(tp.handicap) || 0);
      return {
        id: 't2p' + i + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        firstName: first, lastName: last, name: combineName(first, last),
        hcp: h, rawHcp: h, playsGross: false,
        teeLabel: dayTees[m.tournament_player_id] || (tees.length === 1 ? tees[0].label : null),
''', '''      const _teeLbl = dayTees[m.tournament_player_id] || (tees.length === 1 ? tees[0].label : null);
      const _idxRaw = parseFloat(tp.handicap); const _idx = isFinite(_idxRaw) ? _idxRaw : 0;
      const h = _t2CourseHcpAtLaunch(_idx, _teeLbl, tees, pars, tp.display_name);   // v2065: course handicap off the player's tee (was Math.round(index), v1719)
      return {
        id: 't2p' + i + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        firstName: first, lastName: last, name: combineName(first, last),
        hcp: h, rawHcp: h, eventIndex: _idx, playsGross: false,   // v2065: eventIndex = the roster number the course handicap came from
        teeLabel: _teeLbl,
'''))

# 3. the stored handicap is now the course handicap (already a 9-hole number on a nine)
EDITS.append(('hcp18', '''  r.holes = (Array.isArray(pars) && pars.filter(p => p != null).length === 9) ? 9 : 18;
  r.hcp18 = true;
  return r;
}''', '''  r.holes = (Array.isArray(pars) && pars.filter(p => p != null).length === 9) ? 9 : 18;
  r.hcp18 = false;   // v2065: p.hcp is the tee-adjusted COURSE handicap (already the 9-hole figure on a nine) -- was true since v985, when the launch stored the 18-hole roster number
  return r;
}'''))

# 4. paper cards print the same course handicap
EDITS.append(('print', '''    const ms = (members[g.id] || []).map(m => { const p = pById[m.tournament_player_id] || {}; return { name: p.display_name || 'Player', raw: Math.round(parseFloat(p.handicap) || 0), team: m.team || p.team || null, tee: teeMap[m.tournament_player_id] || '' }; });''',
'''    const ms = (members[g.id] || []).map(m => { const p = pById[m.tournament_player_id] || {}; const _tl = teeMap[m.tournament_player_id] || ''; return { name: p.display_name || 'Player', raw: _t2CourseHcpAtLaunch(parseFloat(p.handicap) || 0, _tl, (sc && sc.tees) || [], pars, p.display_name), team: m.team || p.team || null, tee: _tl }; });   // v2065: the course handicap the round will play, not the raw index'''))

# 5. Assign tees sheet: HCP (index) · Adj (course handicap) under each name, live as the tee changes
EDITS.append(('tees-pars', '''  let tees = [];
  if (cid) { try { const sc = await getCourseScorecard(cid); if (sc && Array.isArray(sc.tees)) tees = sc.tees; } catch (e) {} }
  if (!tees.length) { showToast('No saved tees for that course — add them in the course editor, or players use the default.'); return; }''',
'''  let tees = [], _scPars = null;
  if (cid) { try { const sc = await getCourseScorecard(cid); if (sc && Array.isArray(sc.tees)) tees = sc.tees; if (sc && Array.isArray(sc.pars) && sc.pars.length) _scPars = sc.pars; } catch (e) {} }   // v2065: pars for the Adj readout
  if (!tees.length) { showToast('No saved tees for that course — add them in the course editor, or players use the default.'); return; }'''))

EDITS.append(('tees-rows', '''  const rows = players.map(p => '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;min-width:0">' + escapeHtml(p.display_name) + '</div><select class="ptee" data-pid="' + t2esc(p.id) + '" style="flex:0 0 auto;max-width:55%">' + teeOpt(carryFor(p.id)) + '</select></div>').join('');''',
'''  /* v2065: HCP (the roster index) · Adj (the course handicap off the chosen tee) under each name, so the
     commissioner sees what each player will actually play before the day launches. */
  const _ptAdj = (p, lbl) => {
    try {
      const idx = parseFloat(p.handicap); if (!isFinite(idx)) return '';
      const s = 'HCP ' + (Math.round(idx * 10) / 10);
      if (!lbl) return s;
      return s + ' \\u00b7 Adj ' + _t2CourseHcpAtLaunch(idx, lbl, tees, _scPars || new Array(18).fill(4), p.display_name);
    } catch (e) { return ''; }
  };
  const rows = players.map(p => '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;min-width:0">' + escapeHtml(p.display_name) + '<div class="help-text pt-adj" data-pid="' + t2esc(p.id) + '" style="font-size:11px;margin:0">' + escapeHtml(_ptAdj(p, carryFor(p.id))) + '</div></div><select class="ptee" data-pid="' + t2esc(p.id) + '" style="flex:0 0 auto;max-width:55%">' + teeOpt(carryFor(p.id)) + '</select></div>').join('');'''))

EDITS.append(('tees-help', '''    '<p class="help-text" style="margin-bottom:10px">Pick each player\\'s tee box for this course. Used for handicap strokes and GPS yardages.</p>' +''',
'''    '<p class="help-text" style="margin-bottom:10px">Pick each player\\'s tee box for this course. Used for handicap strokes and GPS yardages.</p>' +
    '<p class="help-text" style="margin:-4px 0 10px">Adj is the course handicap each player will play off that tee (Index \\u00d7 Slope/113 + Rating \\u2212 Par).</p>' +   // v2065'''))

EDITS.append(('tees-wire', '''  document.body.appendChild(ov);
  const close = () => ov.remove();
  /* v1494: opened BY the wizard -> this is the only Back on screen, so it closes
     and steps the wizard back. Opened deliberately -> plain Cancel, stay put. */
  ov.querySelector('#pt-cancel').onclick = () => { close(); try { t2WizEditorBack(); } catch (e) {} };
  { const _aa = ov.querySelector('#pt-all-apply'), _as = ov.querySelector('#pt-all'); if (_aa && _as) _aa.onclick = () => { const v = _as.value; if (!v) { showToast('Pick a tee first'); return; } ov.querySelectorAll('.ptee').forEach(s => { s.value = v; }); try { showToast('All players set to ' + v); } catch (e) {} }; }''',
'''  document.body.appendChild(ov);
  const close = () => ov.remove();
  // v2065: refresh the Adj readout whenever a tee changes
  const _ptRefresh = () => { try { ov.querySelectorAll('.ptee').forEach(s => { const p = players.find(x => x.id === s.dataset.pid); const el = ov.querySelector('.pt-adj[data-pid="' + s.dataset.pid + '"]'); if (p && el) el.textContent = _ptAdj(p, s.value); }); } catch (e) {} };
  try { ov.querySelectorAll('.ptee').forEach(s => { s.addEventListener('change', _ptRefresh); }); } catch (e) {}
  /* v1494: opened BY the wizard -> this is the only Back on screen, so it closes
     and steps the wizard back. Opened deliberately -> plain Cancel, stay put. */
  ov.querySelector('#pt-cancel').onclick = () => { close(); try { t2WizEditorBack(); } catch (e) {} };
  { const _aa = ov.querySelector('#pt-all-apply'), _as = ov.querySelector('#pt-all'); if (_aa && _as) _aa.onclick = () => { const v = _as.value; if (!v) { showToast('Pick a tee first'); return; } ov.querySelectorAll('.ptee').forEach(s => { s.value = v; }); _ptRefresh(); try { showToast('All players set to ' + v); } catch (e) {} }; }'''))

# 6. version markers
EDITS.append(('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'))
EDITS.append(('build', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"))


def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (os.path.basename(path), name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')


if __name__ == '__main__':
    for f in FILES:
        patch(f)
