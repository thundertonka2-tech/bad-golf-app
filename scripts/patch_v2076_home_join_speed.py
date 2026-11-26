#!/usr/bin/env python3
"""v2076 (Tyler, 11/26): "run speed test on the app again, it seems slow when I get to the course and want to join a
game or tourney from the home screen. Can we speed that up?"
Measured: (a) bg_home_feed took 750-1,300 ms on the server for an ordinary player (row security re-checked per row) --
fixed on the server (supabase/SQL_v2076_home_feed_fast.sql: ~100 ms); (b) Home's "Your rounds" card painted ONCE, after
every section had answered -- invites, events, rounds, then scheduled days and the league chain (5-6 more round trips)
-- so a round somebody just started for you appeared last; (c) tapping a tournament round ran five round trips one
after another before the scoring screen showed.
- Home: the moment the live rows are known (invites, my rounds, my event carts) and one of them is not on screen yet,
  the card paints them with the completed rounds; scheduled days and league weeks fold in when they arrive, as before.
  Nothing is painted from guesswork: these are the same rows the final paint uses.
- openT2Round: a "Opening your round..." pill at once; the scorekeeper lookup starts alongside the event read instead of
  after the screen switch; the recents write no longer holds the screen (bounded wait at the end).
- joinRoundByCode: the recents write runs alongside the name lookup and is only waited for when a save follows.

    python scripts/patch_v2076_home_join_speed.py
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2075', 'v2026.11.2076'

EDITS = [
  ('home-early-paint', None,
   """  await _bgBuildCompletedRows(rows);
  try { ((await _p5c) || []).forEach(r => rows.push(r)); } catch (e) {}   // v1725""",
   """  /* v2076 (Tyler, 11/26: "it seems slow when I get to the course and want to join a game or tourney from the home
     screen"): the card used to paint once, after the scheduled days and the league chain below had answered -- so a
     round somebody just started for you showed up last. When a live row is known here and is not on screen yet, paint
     now with the completed rounds; the scheduled rows fold in at the final paint. Same rows, same painter. */
  try {
    const _shown76 = String(state._homeLiveSig || '');
    const _new76 = rows.filter(r => r && _bgRowIsLive(r) && _shown76.split(',').indexOf(r.kind + ':' + (r.code || r.gameCode || '')) < 0);
    if (_new76.length) {
      const _early = rows.slice();
      await _bgBuildCompletedRows(_early);
      _early.forEach(r => { try { if (r && (r.kind === 't2round' || r.t2Id)) r.isTourney = true; } catch (e) {} });
      try { _bgHomeDropStartedInvites(_early); } catch (e) {}
      const _b76 = r => (_bgRowIsLive(r) ? 0 : ((r && r.kind === 'completed') ? 2 : 1));
      const _i76 = new Map(); _early.forEach((r, i) => _i76.set(r, i));
      _early.sort((a, b) => (_b76(a) - _b76(b)) || (_i76.get(a) - _i76.get(b)));
      if (_early.length) { _bgPaintHomeRows(_early); try { window._bgHomeEarlyPaints = (window._bgHomeEarlyPaints || 0) + 1; } catch (e) {} }
    }
  } catch (e) {}
  await _bgBuildCompletedRows(rows);
  try { ((await _p5c) || []).forEach(r => rows.push(r)); } catch (e) {}   // v1725"""),
  ('t2-open-head', 'openT2Round',
   """  if (!code) return;
  const g = await loadGame(code);
  if (!g) { showToast('Round not found'); return; }
  state.game = g;""",
   """  if (!code) return;
  /* v2076 (Tyler, 11/26): Join now ran five round trips in a row with nothing on screen. Say so at once, look the
     scorekeeper up alongside the event read, and let the recents write finish behind the screen. */
  let _pill76 = null; try { if (typeof bgBusyPill === 'function') _pill76 = bgBusyPill(bgT('Opening your round\\u2026')); } catch (e) { _pill76 = null; }
  const _done76 = () => { try { if (_pill76) _pill76.done(); } catch (e) {} _pill76 = null; };
  try { setTimeout(_done76, 8000); } catch (e) {}   // never leave the pill up
  let g = null;
  try { g = await loadGame(code); } catch (e) { g = null; }
  if (!g) { _done76(); showToast('Round not found'); return; }
  state.game = g;
  let _capP = null;
  try { if (!g.finishedAt && g.t2 && g.t2.groupId && typeof supa !== 'undefined' && supa) _capP = _bgRead(() => supa.from('tournament_groups').select('captain').eq('id', g.t2.groupId).maybeSingle(), 'openT2Round:captain'); } catch (e) { _capP = null; }"""),
  ('t2-open-recent', 'openT2Round',
   """  try { await addToRecent(g); } catch (e) {}
  enableGameTabs(true);""",
   """  const _recP = Promise.resolve().then(() => addToRecent(g)).catch(function () {});   // v2076: no longer holds the screen
  enableGameTabs(true);"""),
  ('t2-open-switch', 'openT2Round',
   """  switchTab(state.viewOnlyMode ? 'board' : 'score');""",
   """  switchTab(state.viewOnlyMode ? 'board' : 'score');
  _done76();   // v2076: the round is on screen"""),
  ('t2-open-cap', 'openT2Round',
   """        const _grRead = await _bgRead(() => supa.from('tournament_groups').select('captain').eq('id', g.t2.groupId).maybeSingle(), 'openT2Round:captain');""",
   """        const _grRead = await (_capP || _bgRead(() => supa.from('tournament_groups').select('captain').eq('id', g.t2.groupId).maybeSingle(), 'openT2Round:captain'));   // v2076: already on its way"""),
  ('t2-open-tail', 'openT2Round',
   """  showToast(state.viewOnlyMode ? 'Viewing round (finished)' : 'Joined the round');
}""",
   """  _done76();
  showToast(state.viewOnlyMode ? 'Viewing round (finished)' : 'Joined the round');
  try { await Promise.race([_recP, new Promise(r => setTimeout(r, 3000))]); } catch (e) {}   // v2076: the recents write, bounded
}"""),
  ('join-recent', None,
   """    await safeSet(KEY_LAST, code, false);
    try { await addToRecent(g); } catch (e) { console.warn('addToRecent on join failed:', e); }""",
   """    await safeSet(KEY_LAST, code, false);
    const _recP76 = Promise.resolve().then(() => addToRecent(g)).catch(function (e) { console.warn('addToRecent on join failed:', e); });   // v2076: runs alongside the name lookup"""),
  ('join-save', None,
   """        if (_dirty || _bgSeatStamped) await saveGame(g);""",
   """        if (_dirty || _bgSeatStamped) { await _recP76; await saveGame(g); }   // v2076: a save follows -> the recents write lands first, as before"""),
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
                s, e = scope(src, fn); body = src[s:e]; c = body.count(old)
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
