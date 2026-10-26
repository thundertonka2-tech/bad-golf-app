#!/usr/bin/env python3
"""v1953 — Tournaments tab: the most recently finished event stays visible by default; a stale
'live' event (last day long gone) counts as past instead of pinning itself to the top forever."""
import sys

EDITS = []

EDITS.append((
"""    list.forEach(t => {
      const _st = String(t.status || '').toLowerCase();
      if (_st === 'complete' || _st === 'completed' || _st === 'final' || _st === 'done') { _t2PastSet.add(t.id); return; }
      if (_st === 'live') return;            // live always shows
      const _ld = _lastDate[t.id];
      if (_ld && _ld < _todayStr) _t2PastSet.add(t.id);   // scheduled but its last day already passed
    });
  } catch (e) {}""",
"""    /* v1953 (Tyler, 10/26): "it defaults to this tourney every time instead of showing me
       the most recent one that was completed." Kerbo Group 9/26 was still status 'live'
       (every cart finished, nobody marked the day complete), and 'live' never counted as
       past -- so it sat on top for a month while every newer, properly-completed event hid
       behind Show more. A live event whose last day is more than two days gone is past. */
    const _cut = new Date(_now.getTime() - 2 * 86400000);
    const _cutStr = _cut.getFullYear() + '-' + String(_cut.getMonth() + 1).padStart(2, '0') + '-' + String(_cut.getDate()).padStart(2, '0');
    list.forEach(t => {
      const _st = String(t.status || '').toLowerCase();
      if (_st === 'complete' || _st === 'completed' || _st === 'final' || _st === 'done') { _t2PastSet.add(t.id); return; }
      const _ld = _lastDate[t.id];
      if (_st === 'live') { if (_ld && _ld < _cutStr) _t2PastSet.add(t.id); return; }   // v1953: stale live = past; a live event in play always shows
      if (_ld && _ld < _todayStr) _t2PastSet.add(t.id);   // scheduled but its last day already passed
    });
  } catch (e) {}
  /* v1953: the one most recently finished event stays on the default list (collapsed,
     "results & details"), so the tab opens on the last thing you played instead of a
     "No current tournaments" shrug. Everything older still waits behind Show more. */
  const _t2HideSet = new Set(_t2PastSet);
  try {
    const _lastDate2 = {};
    Object.keys(_daysByT).forEach(_tid => { (_daysByT[_tid] || []).forEach(r => { if (r && r.play_date && (!_lastDate2[_tid] || r.play_date > _lastDate2[_tid])) _lastDate2[_tid] = r.play_date; }); });
    const _keyOf = t => (_lastDate2[t.id] || String(t.created_at || '').slice(0, 10) || '');
    let _best = null;
    list.forEach(t => { if (!_t2PastSet.has(t.id)) return; if (!_best || _keyOf(t) > _keyOf(_best)) _best = t; });
    if (_best) _t2HideSet.delete(_best.id);
  } catch (e) {}""",
"past rule + keep newest"))

EDITS.append((
"""  _t2PastSetRef = _t2PastSet;   // v1585""",
"""  _t2PastSetRef = _t2HideSet;   // v1585 · v1953: hide set (newest finished stays)""",
"ref"))


def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    old = "(_t2ShowPast || !_t2PastSet.has(t.id))"
    n = src.count(old); assert n == 5, f'{path}: visibility exprs: {n}'
    src = src.replace(old, "(_t2ShowPast || !_t2HideSet.has(t.id))")
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: ok')

for p in sys.argv[1:]:
    patch(p)
