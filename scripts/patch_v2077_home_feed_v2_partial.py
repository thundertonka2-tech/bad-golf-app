#!/usr/bin/env python3
"""v2077 (Tyler, 11/26: "Yes, lets do that"): the Home feed for an app admin carried every event in the system
(Tyler 403 KB, Kevin 337 KB). The app now asks bg_home_feed_v2, which sends only the events the caller is part of and
only the rounds of events still running (Tyler 187 KB, Kevin 105 KB, an ordinary player 36 -> 22 KB), and flags the
answer `partial` when the caller could read more than he was sent (an admin).
A partial feed is never treated as the whole truth: a lookup about an event, day or group the feed does not hold goes
to the server, exactly as it did before the feed existed. Old builds keep calling bg_home_feed (unchanged).

    python scripts/patch_v2077_home_feed_v2_partial.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2076', 'v2026.11.2077'

EDITS = [
  ('helpers',
   """function _bgFeedTable(name) { const f = _bgFeed(); return (f && Array.isArray(f[name])) ? f[name] : null; }""",
   """function _bgFeedTable(name) { const f = _bgFeed(); return (f && Array.isArray(f[name])) ? f[name] : null; }
/* v2077 (Tyler, 11/26): bg_home_feed_v2 sends an app admin only the events he is part of and says so (`partial`).
   For everyone else the feed already holds every row they are allowed to read, so "not in the feed" means "there is
   none". For a partial feed it only means "not sent": these say whether the feed can answer for one event / day /
   group, and a reader that gets `false` asks the server instead. */
function _bgFeedPartial() { try { const f = _bgFeed(); return !!(f && f.partial); } catch (e) { return false; } }
function _bgFeedHas(name, id) {
  try {
    const f = _bgFeed(); if (!f) return false;
    if (!f.partial) return true;
    const t = f[name]; if (!Array.isArray(t)) return false;
    const k = String(id);
    for (let i = 0; i < t.length; i++) { if (t[i] && String(t[i].id) === k) return true; }
    return false;
  } catch (e) { return false; }
}
function _bgFeedHasAll(name, ids) { try { const a = Array.from(ids || []); for (let i = 0; i < a.length; i++) { if (!_bgFeedHas(name, a[i])) return false; } return true; } catch (e) { return false; } }"""),
  ('load-v2',
   """      const res = await Promise.race([
        supa.rpc('bg_home_feed', { p_codes: codes, p_name: nm }),
        new Promise(r => setTimeout(() => r({ error: 'timeout' }), 6000))
      ]);""",
   """      /* v2077: bg_home_feed_v2 = my events only (+ rounds of events still running). A server without it answers
         "no such function" once and this phone stays on the original call. */
      let res = null;
      if (!window._bgHomeFeedV2Dead) {
        res = await Promise.race([
          supa.rpc('bg_home_feed_v2', { p_codes: codes, p_name: nm }),
          new Promise(r => setTimeout(() => r({ error: 'timeout' }), 6000))
        ]);
        if (res && res.error && res.error !== 'timeout' && typeof _bgRpcMissing === 'function' && _bgRpcMissing(res.error)) { window._bgHomeFeedV2Dead = true; res = null; }
      }
      if (!res) res = await Promise.race([
        supa.rpc('bg_home_feed', { p_codes: codes, p_name: nm }),
        new Promise(r => setTimeout(() => r({ error: 'timeout' }), 6000))
      ]);"""),
  ('t2-players',
   """if (!(opts && opts.strict)) { const _f = _bgFeedWhere('tournament_players', r => r.tournament_id === tid, 'created_at'); if (_f) return _f; }   // v1736""",
   """if (!(opts && opts.strict) && _bgFeedHas('tournaments', tid)) { const _f = _bgFeedWhere('tournament_players', r => r.tournament_id === tid, 'created_at'); if (_f) return _f; }   // v1736; v2077: only for an event the feed holds"""),
  ('t2-days',
   """if (!(opts && opts.strict)) { const _f = _bgFeedWhere('tournament_days', r => r.tournament_id === tid, 'day_number'); if (_f) return _f; }   // v1736""",
   """if (!(opts && opts.strict) && _bgFeedHas('tournaments', tid)) { const _f = _bgFeedWhere('tournament_days', r => r.tournament_id === tid, 'day_number'); if (_f) return _f; }   // v1736; v2077"""),
  ('t2-groups',
   """if (!(opts && opts.strict)) { const _f = _bgFeedWhere('tournament_groups', r => r.day_id === dayId, 'group_number'); if (_f) return _f; }   // v1736""",
   """if (!(opts && opts.strict) && _bgFeedHas('tournament_days', dayId)) { const _f = _bgFeedWhere('tournament_groups', r => r.day_id === dayId, 'group_number'); if (_f) return _f; }   // v1736; v2077"""),
  ('t2-members',
   """if (!(opts && opts.strict)) { const _f = _bgFeedWhere('tournament_group_members', r => r.group_id === groupId); if (_f) return _f; }   // v1736""",
   """if (!(opts && opts.strict) && _bgFeedHas('tournament_groups', groupId)) { const _f = _bgFeedWhere('tournament_group_members', r => r.group_id === groupId); if (_f) return _f; }   // v1736; v2077"""),
  ('home5c-players',
   """() => { const _s = new Set(_ids5); return _bgFeedWhere('tournament_players', r => _s.has(r.tournament_id)); }""",
   """() => { const _s = new Set(_ids5); return _bgFeedHasAll('tournaments', _s) ? _bgFeedWhere('tournament_players', r => _s.has(r.tournament_id)) : null; }"""),
  ('home5c-days',
   """() => { const _s = new Set(_ids5); return _bgFeedWhere('tournament_days', r => _s.has(r.tournament_id), 'day_number'); }""",
   """() => { const _s = new Set(_ids5); return _bgFeedHasAll('tournaments', _s) ? _bgFeedWhere('tournament_days', r => _s.has(r.tournament_id), 'day_number') : null; }"""),
  ('home5c-groups',
   """() => { const _s = new Set(_dayIds5); return _bgFeedWhere('tournament_groups', r => _s.has(r.day_id), 'group_number'); }""",
   """() => { const _s = new Set(_dayIds5); return _bgFeedHasAll('tournament_days', _s) ? _bgFeedWhere('tournament_groups', r => _s.has(r.day_id), 'group_number') : null; }"""),
  ('home5c-members',
   """() => { const _s = new Set(_gs5.map(g2 => g2.id)); return _bgFeedWhere('tournament_group_members', r => _s.has(r.group_id)); }""",
   """() => { const _s = new Set(_gs5.map(g2 => g2.id)); return _bgFeedHasAll('tournament_groups', _s) ? _bgFeedWhere('tournament_group_members', r => _s.has(r.group_id)) : null; }"""),
  ('list-namematch',
   """() => { const _ln = String(myNm).toLowerCase(); return _bgFeedWhere('tournament_players', r => String(r.display_name == null ? '' : r.display_name).toLowerCase() === _ln); }""",
   """() => { if (_bgFeedPartial()) return null; const _ln = String(myNm).toLowerCase(); return _bgFeedWhere('tournament_players', r => String(r.display_name == null ? '' : r.display_name).toLowerCase() === _ln); }"""),
  ('list-groups-by-code',
   """() => { const _cs = new Set(codes); return _bgFeedWhere('tournament_groups', r => !!r.game_code && _cs.has(r.game_code)); }""",
   """() => { if (_bgFeedPartial()) return null; const _cs = new Set(codes); return _bgFeedWhere('tournament_groups', r => !!r.game_code && _cs.has(r.game_code)); }"""),
  ('list-days-by-group',
   """() => { const _ds = new Set(_dayIds); return _bgFeedWhere('tournament_days', r => _ds.has(r.id)); }""",
   """() => { const _ds = new Set(_dayIds); return _bgFeedHasAll('tournament_days', _ds) ? _bgFeedWhere('tournament_days', r => _ds.has(r.id)) : null; }"""),
  ('trophy-codes',
   """      const _ftg = want ? _bgFeedTable('tournament_groups') : null;   // v1736""",
   """      const _ftg = (want && !_bgFeedPartial()) ? _bgFeedTable('tournament_groups') : null;   // v1736; v2077: a partial feed cannot say a code is NOT a tournament round"""),
]

def main():
    for f in FILES:
        src = open(f, encoding='utf-8', newline='').read()
        crlf = '\r\n' in src
        if crlf: src = src.replace('\r\n', '\n')
        for name, old, new in EDITS:
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
