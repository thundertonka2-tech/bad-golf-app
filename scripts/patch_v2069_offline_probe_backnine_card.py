#!/usr/bin/env python3
"""v2069 (Bad Golf Wednesday 11/25, Brewer's cart):

1. Brewer put his phone in airplane mode on hole 3; when it came back the app never synced again -- not the
   queued scores, not even the 48-second refresh. The app only learns it is back online from the browser's
   'online' event, which the iPhone does not fire reliably after airplane mode, so `supaOnline` stayed false
   and every sync path (the 15-second flush, the Retry now button, the round poll) bailed out before trying.
   Now the app PROBES the connection itself (bgNetProbe: a HEAD to the Supabase REST root, 4 s): the flush
   probes before giving up whenever rounds are queued, Retry now probes, the app re-probes when it comes to
   the foreground, and a 20-second watchdog re-probes while the app believes it is offline.

2. Tyler: "when we start a round on the back on the scorecard page we need to flip the side there as well so
   the back nine is the first nine we see and the front nine is the second." The stacked phone scorecard
   (bgScSplit) now puts holes 10-18 first and 1-9 second when the round started on 10 (bgEffectiveStartHole:
   an explicit back-nine start, or the first score ever entered on hole 10). Tot rides on the second nine.

    python scripts/patch_v2069_offline_probe_backnine_card.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2068', 'v2026.11.2069'

EDITS = [
  ('probe-fn',
   """window.addEventListener('online', () => { supaOnline = true; updateSyncIndicator(); });
window.addEventListener('offline', () => { supaOnline = false; updateSyncIndicator(); });""",
   """window.addEventListener('online', () => { supaOnline = true; updateSyncIndicator(); });
window.addEventListener('offline', () => { supaOnline = false; updateSyncIndicator(); });
/* v2069 (Brewer, 11/25): airplane mode on hole 3, back on the next hole -- and the phone never synced again,
   because iOS did not fire the 'online' event and every sync path waits on supaOnline. Ask the network
   ourselves: any HTTP answer from the Supabase REST root (a 401 counts) means we are reachable. */
let _bgNetProbeAt = 0, _bgNetProbeBusy = null;
async function bgNetProbe(opts) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (_bgNetProbeBusy) return _bgNetProbeBusy;
    if (!(opts && opts.force) && Date.now() - _bgNetProbeAt < 5000) return !!supaOnline;
    _bgNetProbeBusy = (async () => {
      let ok = false;
      try {
        const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
        const tm = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) {} }, 4000);
        try {
          const r = await fetch(SUPABASE_URL + '/rest/v1/', { method: 'HEAD', cache: 'no-store', headers: { apikey: SUPABASE_ANON_KEY }, signal: ctl ? ctl.signal : undefined });
          ok = !!r;   // reached the server: whatever the status, the network is up
        } finally { clearTimeout(tm); }
      } catch (e) { ok = false; }
      _bgNetProbeAt = Date.now();
      if (ok && !supaOnline) { supaOnline = true; try { updateSyncIndicator(); } catch (e) {} try { console.log('[BG v2069] back online (probe)'); } catch (e) {} }
      return ok;
    })();
    try { return await _bgNetProbeBusy; } finally { _bgNetProbeBusy = null; }
  } catch (e) { return false; }
}
// Re-probe when the app comes to the foreground, and every 20 s while it believes it is offline.
try { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !supaOnline) bgNetProbe({ force: true }).catch(() => {}); }); } catch (e) {}
try { window.addEventListener('pageshow', () => { if (!supaOnline) bgNetProbe({ force: true }).catch(() => {}); }); } catch (e) {}
try { setInterval(() => { if (!supaOnline) bgNetProbe().catch(() => {}); }, 20000); } catch (e) {}"""),
  ('flush-probe',
   """  const pending = _dirtyGames();
  if (!pending.length) return;
  try { if (!supaReady) await initSupabase(); } catch (e) {}
  if (!supa || !supaOnline) return;
  for (const code of pending) {""",
   """  const pending = _dirtyGames();
  if (!pending.length) return;
  try { if (!supaReady) await initSupabase(); } catch (e) {}
  if (!supa) return;
  if (!supaOnline) { let _up = false; try { _up = await bgNetProbe({ force: _force }); } catch (e) { _up = false; } if (!_up) return; }   // v2069: rounds are waiting -- check the network ourselves instead of trusting a missed 'online' event
  for (const code of pending) {"""),
  ('split-order',
   """function bgScSplit(table) {
  try {
    const map = bgScColMap(table); if (!map || map.nHoles !== 18 || map.out == null || map.in == null) return null;
    const keepF = new Set([map.name]); const keepB = new Set([map.name]);
    for (let h = 1; h <= 9; h++) keepF.add(map.holes[h]); keepF.add(map.out);
    for (let h = 10; h <= 18; h++) keepB.add(map.holes[h]); keepB.add(map.in); if (map.tot != null) keepB.add(map.tot);""",
   """function bgScSplit(table, g) {
  try {
    const map = bgScColMap(table); if (!map || map.nHoles !== 18 || map.out == null || map.in == null) return null;
    // v2069 (Tyler): a round that started on 10 shows the back nine first and the front nine second; Tot rides on the second nine.
    let _backFirst = false; try { _backFirst = !!(g && typeof bgEffectiveStartHole === 'function' && bgEffectiveStartHole(g) === 10); } catch (e) { _backFirst = false; }
    const keepF = new Set([map.name]); const keepB = new Set([map.name]);
    for (let h = 1; h <= 9; h++) keepF.add(map.holes[h]); keepF.add(map.out);
    for (let h = 10; h <= 18; h++) keepB.add(map.holes[h]); keepB.add(map.in);
    if (map.tot != null) (_backFirst ? keepF : keepB).add(map.tot);"""),
  ('split-return',
   """    return [make(keepF, false), make(keepB, true)];
  } catch (e) { return null; }
}""",
   """    return _backFirst ? [make(keepB, false), make(keepF, true)] : [make(keepF, false), make(keepB, true)];   // v2069
  } catch (e) { return null; }
}"""),
  ('frame-g',
   """      const pair = bgScSplit(t);
      if (pair) { anySplit = true; stackParts.push(pair[0].outerHTML + pair[1].outerHTML); }""",
   """      const pair = bgScSplit(t, opts.rowsG || g);   // v2069: the round decides which nine comes first
      if (pair) { anySplit = true; stackParts.push(pair[0].outerHTML + pair[1].outerHTML); }"""),
  ('twin-g',
   """        const pair = bgScSplit(t);
        twin.innerHTML = pair ? pair[0].outerHTML + pair[1].outerHTML : '';""",
   """        let _tg = null; try { _tg = (typeof state !== 'undefined' && state && state.game) ? state.game : null; } catch (e) { _tg = null; }
        const pair = bgScSplit(t, _tg);   // v2069
        twin.innerHTML = pair ? pair[0].outerHTML + pair[1].outerHTML : '';"""),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('build', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]


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
